# A tiny video relay on 127.0.0.1 (GET /__streamport starts it and answers its port).
# The Fanoos player asks http://127.0.0.1:<port>/s?u=<video address>&r=<Referer>; the relay fetches that address
# with the Referer (and the player's Range) and passes the answer back unchanged: real HTTP, so seeking, resuming
# and byte ranges behave like any video server. Hosts such as Mixdrop and Doodstream need that Referer.
# Java equivalent: port() = lazily new ServerSocket(0, 50, 127.0.0.1) + an accept thread; serve() per connection.
.class public Lapp/fanoos/LocalProxy;
.super Ljava/lang/Object;
.implements Ljava/lang/Runnable;

.field private static server:Ljava/net/ServerSocket;
.field private final client:Ljava/net/Socket;

.method public constructor <init>(Ljava/net/Socket;)V
    .registers 2
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lapp/fanoos/LocalProxy;->client:Ljava/net/Socket;
    return-void
.end method

.method static declared-synchronized port()I
    .registers 5
    sget-object v0, Lapp/fanoos/LocalProxy;->server:Ljava/net/ServerSocket;
    if-nez v0, :have
    :try_start
    new-instance v0, Ljava/net/ServerSocket;
    const/16 v1, 0x32
    const-string v2, "127.0.0.1"
    invoke-static {v2}, Ljava/net/InetAddress;->getByName(Ljava/lang/String;)Ljava/net/InetAddress;
    move-result-object v2
    const/4 v3, 0x0
    invoke-direct {v0, v3, v1, v2}, Ljava/net/ServerSocket;-><init>(IILjava/net/InetAddress;)V
    sput-object v0, Lapp/fanoos/LocalProxy;->server:Ljava/net/ServerSocket;
    new-instance v1, Ljava/lang/Thread;
    new-instance v2, Lapp/fanoos/LocalProxy;
    const/4 v3, 0x0
    invoke-direct {v2, v3}, Lapp/fanoos/LocalProxy;-><init>(Ljava/net/Socket;)V
    invoke-direct {v1, v2}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V
    invoke-virtual {v1}, Ljava/lang/Thread;->start()V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :fail
    :have
    sget-object v0, Lapp/fanoos/LocalProxy;->server:Ljava/net/ServerSocket;
    invoke-virtual {v0}, Ljava/net/ServerSocket;->getLocalPort()I
    move-result v0
    return v0
    :fail
    const/4 v0, 0x0
    return v0
.end method

# The accept loop (client == null), or one connection.
.method public run()V
    .registers 4
    iget-object v0, p0, Lapp/fanoos/LocalProxy;->client:Ljava/net/Socket;
    if-nez v0, :serve
    :loop
    :try_start
    sget-object v0, Lapp/fanoos/LocalProxy;->server:Ljava/net/ServerSocket;
    invoke-virtual {v0}, Ljava/net/ServerSocket;->accept()Ljava/net/Socket;
    move-result-object v0
    new-instance v1, Ljava/lang/Thread;
    new-instance v2, Lapp/fanoos/LocalProxy;
    invoke-direct {v2, v0}, Lapp/fanoos/LocalProxy;-><init>(Ljava/net/Socket;)V
    invoke-direct {v1, v2}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V
    invoke-virtual {v1}, Ljava/lang/Thread;->start()V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :stop
    goto :loop
    :stop
    return-void
    :serve
    invoke-direct {p0}, Lapp/fanoos/LocalProxy;->serve()V
    return-void
.end method

.method private static readLine(Ljava/io/InputStream;)Ljava/lang/String;
    .registers 4
    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V
    :loop
    invoke-virtual {p0}, Ljava/io/InputStream;->read()I
    move-result v1
    if-ltz v1, :eof
    const/16 v2, 0xa
    if-eq v1, v2, :done
    const/16 v2, 0xd
    if-eq v1, v2, :loop
    int-to-char v1, v1
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(C)Ljava/lang/StringBuilder;
    goto :loop
    :eof
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->length()I
    move-result v1
    if-nez v1, :done
    const/4 v0, 0x0
    return-object v0
    :done
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0
    return-object v0
.end method

.method private static copyHeader(Ljava/lang/StringBuilder;Ljava/net/HttpURLConnection;Ljava/lang/String;)V
    .registers 5
    invoke-virtual {p1, p2}, Ljava/net/HttpURLConnection;->getHeaderField(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :skip
    invoke-virtual {p0, p2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v1, ": "
    invoke-virtual {p0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {p0, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v1, "\r\n"
    invoke-virtual {p0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    :skip
    return-void
.end method

.method private serve()V
    .registers 12
    # v0 socket, v1 request in, v2 request line, v3 Range, v6 address, v7 Referer, v8 upstream, v9 status, v10 out
    iget-object v0, p0, Lapp/fanoos/LocalProxy;->client:Ljava/net/Socket;
    const/4 v8, 0x0
    :try_start
    invoke-virtual {v0}, Ljava/net/Socket;->getInputStream()Ljava/io/InputStream;
    move-result-object v1
    invoke-static {v1}, Lapp/fanoos/LocalProxy;->readLine(Ljava/io/InputStream;)Ljava/lang/String;
    move-result-object v2
    if-eqz v2, :close
    const/4 v3, 0x0
    :hloop
    invoke-static {v1}, Lapp/fanoos/LocalProxy;->readLine(Ljava/io/InputStream;)Ljava/lang/String;
    move-result-object v4
    if-eqz v4, :hdone
    invoke-virtual {v4}, Ljava/lang/String;->length()I
    move-result v5
    if-eqz v5, :hdone
    invoke-virtual {v4}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;
    move-result-object v5
    const-string v6, "range:"
    invoke-virtual {v5, v6}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v5
    if-eqz v5, :hloop
    const/4 v5, 0x6
    invoke-virtual {v4, v5}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v3}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v3
    goto :hloop
    :hdone
    const-string v4, " "
    invoke-virtual {v2, v4}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;
    move-result-object v4
    array-length v5, v4
    const/4 v6, 0x2
    if-lt v5, v6, :close
    const/4 v5, 0x1
    aget-object v4, v4, v5
    const-string v5, "http://localhost"
    invoke-virtual {v5, v4}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    invoke-static {v4}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v5
    const-string v4, "u"
    invoke-virtual {v5, v4}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v6
    if-eqz v6, :close
    const-string v4, "r"
    invoke-virtual {v5, v4}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v7

    new-instance v4, Ljava/net/URL;
    invoke-direct {v4, v6}, Ljava/net/URL;-><init>(Ljava/lang/String;)V
    invoke-virtual {v4}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;
    move-result-object v4
    check-cast v4, Ljava/net/HttpURLConnection;
    move-object v8, v4
    const/16 v4, 0x3a98
    invoke-virtual {v8, v4}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V
    const/16 v4, 0x7530
    invoke-virtual {v8, v4}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V
    if-eqz v7, :noref
    const-string v4, "Referer"
    invoke-virtual {v8, v4, v7}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    :noref
    if-eqz v3, :norange
    const-string v4, "Range"
    invoke-virtual {v8, v4, v3}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    :norange
    invoke-virtual {v8}, Ljava/net/HttpURLConnection;->getResponseCode()I
    move-result v9

    # adb logcat -s FanoosRef
    new-instance v4, Ljava/lang/StringBuilder;
    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V
    const-string v5, "relay "
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4, v9}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v5, " "
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v5, " "
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v4
    const-string v5, "FanoosRef"
    invoke-static {v5, v4}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I

    new-instance v4, Ljava/lang/StringBuilder;
    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V
    const-string v5, "HTTP/1.1 "
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4, v9}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v5, " OK\r\n"
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v5, "Content-Type"
    invoke-static {v4, v8, v5}, Lapp/fanoos/LocalProxy;->copyHeader(Ljava/lang/StringBuilder;Ljava/net/HttpURLConnection;Ljava/lang/String;)V
    const-string v5, "Content-Length"
    invoke-static {v4, v8, v5}, Lapp/fanoos/LocalProxy;->copyHeader(Ljava/lang/StringBuilder;Ljava/net/HttpURLConnection;Ljava/lang/String;)V
    const-string v5, "Content-Range"
    invoke-static {v4, v8, v5}, Lapp/fanoos/LocalProxy;->copyHeader(Ljava/lang/StringBuilder;Ljava/net/HttpURLConnection;Ljava/lang/String;)V
    const-string v5, "Accept-Ranges"
    invoke-static {v4, v8, v5}, Lapp/fanoos/LocalProxy;->copyHeader(Ljava/lang/StringBuilder;Ljava/net/HttpURLConnection;Ljava/lang/String;)V
    const-string v5, "Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v0}, Ljava/net/Socket;->getOutputStream()Ljava/io/OutputStream;
    move-result-object v10
    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v4
    const-string v5, "UTF-8"
    invoke-virtual {v4, v5}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B
    move-result-object v4
    invoke-virtual {v10, v4}, Ljava/io/OutputStream;->write([B)V

    const/16 v4, 0x190
    if-lt v9, v4, :okbody
    invoke-virtual {v8}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;
    move-result-object v4
    goto :gotbody
    :okbody
    invoke-virtual {v8}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;
    move-result-object v4
    :gotbody
    if-eqz v4, :flush
    const/high16 v5, 0x10000
    new-array v5, v5, [B
    :copy
    invoke-virtual {v4, v5}, Ljava/io/InputStream;->read([B)I
    move-result v6
    if-lez v6, :bodydone
    const/4 v7, 0x0
    invoke-virtual {v10, v5, v7, v6}, Ljava/io/OutputStream;->write([BII)V
    goto :copy
    :bodydone
    invoke-virtual {v4}, Ljava/io/InputStream;->close()V
    :flush
    invoke-virtual {v10}, Ljava/io/OutputStream;->flush()V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :close

    # the player hung up (seeking) or the transfer ended: release both sides
    :close
    if-eqz v8, :noupstream
    invoke-virtual {v8}, Ljava/net/HttpURLConnection;->disconnect()V
    :noupstream
    :try_start2
    invoke-virtual {v0}, Ljava/net/Socket;->close()V
    :try_end2
    .catch Ljava/lang/Exception; {:try_start2 .. :try_end2} :done
    :done
    return-void
.end method
