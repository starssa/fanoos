# Video hosts that only serve their own player (e.g. mixdrop's files): Fanoos registers host -> referer
# (GET /__referer?host=&ref=), then every request to that host is fetched here with that Referer.
# Java equivalent of open(): copy the WebView's headers (Range included) + Referer, stream the answer back
# with CORS allowed; null (let the WebView load it) for unregistered hosts, redirects across protocols, errors.
.class public Lapp/fanoos/RefStream;
.super Ljava/lang/Object;

.field private static final hosts:Ljava/util/concurrent/ConcurrentHashMap;

.method static constructor <clinit>()V
    .registers 1
    new-instance v0, Ljava/util/concurrent/ConcurrentHashMap;
    invoke-direct {v0}, Ljava/util/concurrent/ConcurrentHashMap;-><init>()V
    sput-object v0, Lapp/fanoos/RefStream;->hosts:Ljava/util/concurrent/ConcurrentHashMap;
    return-void
.end method

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method static register(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    .registers 5
    const-string v0, "host"
    invoke-virtual {p0, v0}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    const-string v1, "ref"
    invoke-virtual {p0, v1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1
    if-eqz v0, :bad
    if-eqz v1, :bad
    sget-object v2, Lapp/fanoos/RefStream;->hosts:Ljava/util/concurrent/ConcurrentHashMap;
    invoke-virtual {v2, v0, v1}, Ljava/util/concurrent/ConcurrentHashMap;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    const-string v2, "FanoosRef"
    const-string v3, "register "
    invoke-virtual {v3, v0}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v3
    invoke-static {v2, v3}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I
    const/16 v2, 0xc8
    const-string v3, "ok"
    invoke-static {v2, v3}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v2
    return-object v2
    :bad
    const/16 v2, 0x190
    const-string v3, "host and ref are needed"
    invoke-static {v2, v3}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v2
    return-object v2
.end method

.method private static copy(Ljava/net/HttpURLConnection;Ljava/util/HashMap;Ljava/lang/String;)V
    .registers 4
    invoke-virtual {p0, p2}, Ljava/net/HttpURLConnection;->getHeaderField(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :skip
    invoke-virtual {p1, p2, v0}, Ljava/util/HashMap;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    :skip
    return-void
.end method

.method static open(Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .registers 14
    # p0=v13 request. v2 referer, v3 connection, v5 status, v6 body stream, v7 headers, v8 mime, v9 reason
    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :none
    sget-object v2, Lapp/fanoos/RefStream;->hosts:Ljava/util/concurrent/ConcurrentHashMap;
    invoke-virtual {v2, v1}, Ljava/util/concurrent/ConcurrentHashMap;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v2
    if-eqz v2, :none
    check-cast v2, Ljava/lang/String;

    :try_start
    new-instance v3, Ljava/net/URL;
    invoke-virtual {v0}, Landroid/net/Uri;->toString()Ljava/lang/String;
    move-result-object v4
    invoke-direct {v3, v4}, Ljava/net/URL;-><init>(Ljava/lang/String;)V
    invoke-virtual {v3}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;
    move-result-object v3
    check-cast v3, Ljava/net/HttpURLConnection;
    const/16 v4, 0x3a98
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V
    const/16 v4, 0x7530
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V
    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->getMethod()Ljava/lang/String;
    move-result-object v4
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setRequestMethod(Ljava/lang/String;)V

    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;
    move-result-object v4
    if-eqz v4, :hdone
    invoke-interface {v4}, Ljava/util/Map;->entrySet()Ljava/util/Set;
    move-result-object v4
    invoke-interface {v4}, Ljava/util/Set;->iterator()Ljava/util/Iterator;
    move-result-object v4
    :hloop
    invoke-interface {v4}, Ljava/util/Iterator;->hasNext()Z
    move-result v5
    if-eqz v5, :hdone
    invoke-interface {v4}, Ljava/util/Iterator;->next()Ljava/lang/Object;
    move-result-object v5
    check-cast v5, Ljava/util/Map$Entry;
    invoke-interface {v5}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;
    move-result-object v6
    check-cast v6, Ljava/lang/String;
    invoke-interface {v5}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;
    move-result-object v5
    check-cast v5, Ljava/lang/String;
    # Keep the identity of the native page fetch that got this link (hosts like Mixdrop sign links for one visitor):
    # not the WebView's User-Agent, nor its X-Requested-With app header.
    const-string v7, "User-Agent"
    invoke-virtual {v7, v6}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v7
    if-nez v7, :hloop
    const-string v7, "X-Requested-With"
    invoke-virtual {v7, v6}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v7
    if-nez v7, :hloop
    invoke-virtual {v3, v6, v5}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    goto :hloop
    :hdone
    const-string v4, "Referer"
    invoke-virtual {v3, v4, v2}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getResponseCode()I
    move-result v5
    # adb logcat -s FanoosRef: what the video server answered
    new-instance v4, Ljava/lang/StringBuilder;
    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V
    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v6, " "
    invoke-virtual {v4, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v0}, Landroid/net/Uri;->toString()Ljava/lang/String;
    move-result-object v6
    invoke-virtual {v4, v6}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v4
    const-string v6, "FanoosRef"
    invoke-static {v6, v4}, Landroid/util/Log;->i(Ljava/lang/String;Ljava/lang/String;)I
    # a WebResourceResponse can't carry 3xx: let the WebView handle those
    const/16 v4, 0x12c
    if-lt v5, v4, :code_ok
    const/16 v4, 0x190
    if-lt v5, v4, :none
    :code_ok
    const/16 v4, 0x190
    if-lt v5, v4, :okstream
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;
    move-result-object v6
    goto :gotstream
    :okstream
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;
    move-result-object v6
    :gotstream

    new-instance v7, Ljava/util/HashMap;
    invoke-direct {v7}, Ljava/util/HashMap;-><init>()V
    const-string v8, "Access-Control-Allow-Origin"
    const-string v9, "*"
    invoke-virtual {v7, v8, v9}, Ljava/util/HashMap;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    const-string v8, "Access-Control-Allow-Headers"
    invoke-virtual {v7, v8, v9}, Ljava/util/HashMap;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    const-string v8, "Access-Control-Expose-Headers"
    invoke-virtual {v7, v8, v9}, Ljava/util/HashMap;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    const-string v8, "Content-Range"
    invoke-static {v3, v7, v8}, Lapp/fanoos/RefStream;->copy(Ljava/net/HttpURLConnection;Ljava/util/HashMap;Ljava/lang/String;)V
    const-string v8, "Content-Length"
    invoke-static {v3, v7, v8}, Lapp/fanoos/RefStream;->copy(Ljava/net/HttpURLConnection;Ljava/util/HashMap;Ljava/lang/String;)V
    const-string v8, "Accept-Ranges"
    invoke-static {v3, v7, v8}, Lapp/fanoos/RefStream;->copy(Ljava/net/HttpURLConnection;Ljava/util/HashMap;Ljava/lang/String;)V

    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getContentType()Ljava/lang/String;
    move-result-object v8
    if-nez v8, :has_type
    const-string v8, "application/octet-stream"
    :has_type
    const/16 v9, 0x3b
    invoke-virtual {v8, v9}, Ljava/lang/String;->indexOf(I)I
    move-result v9
    if-ltz v9, :mime_done
    const/4 v10, 0x0
    invoke-virtual {v8, v10, v9}, Ljava/lang/String;->substring(II)Ljava/lang/String;
    move-result-object v8
    :mime_done
    invoke-virtual {v8}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v8

    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getResponseMessage()Ljava/lang/String;
    move-result-object v9
    if-eqz v9, :no_reason
    invoke-virtual {v9}, Ljava/lang/String;->length()I
    move-result v10
    if-nez v10, :has_reason
    :no_reason
    const-string v9, "OK"
    :has_reason

    # new WebResourceResponse(mime, null, status, reason, headers, stream)
    move-object v1, v8
    const/4 v2, 0x0
    move v3, v5
    move-object v4, v9
    move-object v5, v7
    new-instance v0, Landroid/webkit/WebResourceResponse;
    invoke-direct/range {v0 .. v6}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V
    return-object v0
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :failed

    :failed
    move-exception v1
    const-string v2, "FanoosRef"
    invoke-virtual {v1}, Ljava/lang/Exception;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-static {v2, v1}, Landroid/util/Log;->w(Ljava/lang/String;Ljava/lang/String;)I

    :none
    const/4 v0, 0x0
    return-object v0
.end method
