# Static helpers. Java equivalent:
#
#   static WebResourceResponse handle(Uri u)   // GET /__proxy?r=<json {url,method,headers,body}>[&bin=1]
#     -> bin: raw bytes (502 on HTTP error); else JSON {status,url,headers,body}
#   static WebResourceResponse asset(Context c, String path)  // assets/www<path>
#   static WebResourceResponse text(int status, String s)
#   static WebResourceResponse bytes(int status, String mime, byte[] data)
#   static byte[] readAll(InputStream in)
#   static String mime(String path)
#   static WebResourceResponse open(Activity a, Uri u)  // GET /__open?url=&type=&title=&pkg= -> external player (ACTION_VIEW)
.class public Lapp/fanoos/Proxy;
.super Ljava/lang/Object;

.method static bytes(ILjava/lang/String;[B)Landroid/webkit/WebResourceResponse;
    .registers 13
    # p0=v10 status, p1=v11 mime, p2=v12 data
    const-string v0, "OK"
    const/16 v1, 0x190
    if-lt p0, v1, :ok
    const-string v0, "Error"
    :ok
    new-instance v1, Ljava/util/HashMap;
    invoke-direct {v1}, Ljava/util/HashMap;-><init>()V
    new-instance v2, Ljava/io/ByteArrayInputStream;
    invoke-direct {v2, p2}, Ljava/io/ByteArrayInputStream;-><init>([B)V
    new-instance v3, Landroid/webkit/WebResourceResponse;
    move-object v4, p1
    const-string v5, "utf-8"
    move v6, p0
    move-object v7, v0
    move-object v8, v1
    move-object v9, v2
    invoke-direct/range {v3 .. v9}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V
    return-object v3
.end method

.method static text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    .registers 5
    const-string v0, "UTF-8"
    invoke-virtual {p1, v0}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B
    move-result-object v0
    const-string v1, "text/plain"
    invoke-static {p0, v1, v0}, Lapp/fanoos/Proxy;->bytes(ILjava/lang/String;[B)Landroid/webkit/WebResourceResponse;
    move-result-object v0
    return-object v0
.end method

.method static readAll(Ljava/io/InputStream;)[B
    .registers 6
    new-instance v0, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v0}, Ljava/io/ByteArrayOutputStream;-><init>()V
    if-eqz p0, :done
    const/16 v1, 0x2000
    new-array v1, v1, [B
    :loop
    invoke-virtual {p0, v1}, Ljava/io/InputStream;->read([B)I
    move-result v2
    if-ltz v2, :close
    const/4 v3, 0x0
    invoke-virtual {v0, v1, v3, v2}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto :loop
    :close
    invoke-virtual {p0}, Ljava/io/InputStream;->close()V
    :done
    invoke-virtual {v0}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v0
    return-object v0
.end method

.method static mime(Ljava/lang/String;)Ljava/lang/String;
    .registers 3
    const-string v0, ".js"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :css
    const-string v0, "application/javascript"
    return-object v0
    :css
    const-string v0, ".css"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :html
    const-string v0, "text/css"
    return-object v0
    :html
    const-string v0, ".html"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :json
    const-string v0, "text/html"
    return-object v0
    :json
    const-string v0, ".json"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :svg
    const-string v0, "application/json"
    return-object v0
    :svg
    const-string v0, ".svg"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :png
    const-string v0, "image/svg+xml"
    return-object v0
    :png
    const-string v0, ".png"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :other
    const-string v0, "image/png"
    return-object v0
    :other
    const-string v0, "application/octet-stream"
    return-object v0
.end method

.method static asset(Landroid/content/Context;Ljava/lang/String;)Landroid/webkit/WebResourceResponse;
    .registers 6
    if-eqz p1, :index
    const-string v0, "/"
    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v0
    if-eqz v0, :checked
    :index
    const-string p1, "/index.html"
    :checked
    const-string v0, ".."
    invoke-virtual {p1, v0}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v0
    if-nez v0, :notfound

    :try_start
    invoke-virtual {p0}, Landroid/content/Context;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v0
    new-instance v1, Ljava/lang/StringBuilder;
    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V
    const-string v2, "www"
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v1, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v1
    invoke-virtual {v0, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v0
    invoke-static {v0}, Lapp/fanoos/Proxy;->readAll(Ljava/io/InputStream;)[B
    move-result-object v0
    invoke-static {p1}, Lapp/fanoos/Proxy;->mime(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v1
    const/16 v2, 0xc8
    invoke-static {v2, v1, v0}, Lapp/fanoos/Proxy;->bytes(ILjava/lang/String;[B)Landroid/webkit/WebResourceResponse;
    move-result-object v0
    return-object v0
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :failed

    :failed
    move-exception v0
    :notfound
    const/16 v0, 0x194
    const-string v1, "Not found"
    invoke-static {v0, v1}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v0
    return-object v0
.end method

.method static handle(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    .registers 11
    # p0=v10 uri. v0 bin flag, v1 request json, v2 url, v3 connection, v8 status, v9 body bytes
    :try_start
    const-string v4, "bin"
    invoke-virtual {p0, v4}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    const/4 v0, 0x0
    if-eqz v4, :nobin
    const/4 v0, 0x1
    :nobin
    const-string v4, "r"
    invoke-virtual {p0, v4}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    new-instance v1, Lorg/json/JSONObject;
    invoke-direct {v1, v4}, Lorg/json/JSONObject;-><init>(Ljava/lang/String;)V
    const-string v4, "url"
    invoke-virtual {v1, v4}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v2

    const-string v4, "http://"
    invoke-virtual {v2, v4}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v4
    if-nez v4, :scheme_ok
    const-string v4, "https://"
    invoke-virtual {v2, v4}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v4
    if-nez v4, :scheme_ok
    const/16 v4, 0x190
    const-string v5, "Blocked URL scheme"
    invoke-static {v4, v5}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v4
    return-object v4

    :scheme_ok
    new-instance v4, Ljava/net/URL;
    invoke-direct {v4, v2}, Ljava/net/URL;-><init>(Ljava/lang/String;)V
    invoke-virtual {v4}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;
    move-result-object v3
    check-cast v3, Ljava/net/HttpURLConnection;
    const/16 v4, 0x4e20
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V
    const/16 v4, 0x7530
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V
    const-string v4, "method"
    const-string v5, "GET"
    invoke-virtual {v1, v4, v5}, Lorg/json/JSONObject;->optString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    invoke-virtual {v3, v4}, Ljava/net/HttpURLConnection;->setRequestMethod(Ljava/lang/String;)V

    const-string v4, "headers"
    invoke-virtual {v1, v4}, Lorg/json/JSONObject;->optJSONObject(Ljava/lang/String;)Lorg/json/JSONObject;
    move-result-object v4
    if-eqz v4, :noheaders
    invoke-virtual {v4}, Lorg/json/JSONObject;->keys()Ljava/util/Iterator;
    move-result-object v5
    :hloop
    invoke-interface {v5}, Ljava/util/Iterator;->hasNext()Z
    move-result v6
    if-eqz v6, :noheaders
    invoke-interface {v5}, Ljava/util/Iterator;->next()Ljava/lang/Object;
    move-result-object v6
    check-cast v6, Ljava/lang/String;
    invoke-virtual {v4, v6}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v7
    invoke-virtual {v3, v6, v7}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    goto :hloop

    :noheaders
    const-string v4, "body"
    invoke-virtual {v1, v4}, Lorg/json/JSONObject;->isNull(Ljava/lang/String;)Z
    move-result v5
    if-nez v5, :nobody
    const/4 v5, 0x1
    invoke-virtual {v3, v5}, Ljava/net/HttpURLConnection;->setDoOutput(Z)V
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getOutputStream()Ljava/io/OutputStream;
    move-result-object v5
    invoke-virtual {v1, v4}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v6
    const-string v7, "UTF-8"
    invoke-virtual {v6, v7}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B
    move-result-object v6
    invoke-virtual {v5, v6}, Ljava/io/OutputStream;->write([B)V
    invoke-virtual {v5}, Ljava/io/OutputStream;->close()V

    :nobody
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getResponseCode()I
    move-result v8
    const/16 v4, 0x190
    if-lt v8, v4, :okstream
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;
    move-result-object v4
    goto :read
    :okstream
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;
    move-result-object v4
    :read
    invoke-static {v4}, Lapp/fanoos/Proxy;->readAll(Ljava/io/InputStream;)[B
    move-result-object v9

    if-eqz v0, :json
    const/16 v4, 0x190
    if-lt v8, v4, :binok
    const/16 v4, 0x1f6
    const-string v5, "Download failed"
    invoke-static {v4, v5}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v4
    return-object v4
    :binok
    const/16 v4, 0xc8
    const-string v5, "application/octet-stream"
    invoke-static {v4, v5, v9}, Lapp/fanoos/Proxy;->bytes(ILjava/lang/String;[B)Landroid/webkit/WebResourceResponse;
    move-result-object v4
    return-object v4

    :json
    new-instance v4, Lorg/json/JSONObject;
    invoke-direct {v4}, Lorg/json/JSONObject;-><init>()V
    const-string v5, "status"
    invoke-virtual {v4, v5, v8}, Lorg/json/JSONObject;->put(Ljava/lang/String;I)Lorg/json/JSONObject;
    const-string v5, "url"
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getURL()Ljava/net/URL;
    move-result-object v6
    invoke-virtual {v6}, Ljava/net/URL;->toString()Ljava/lang/String;
    move-result-object v6
    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    new-instance v5, Lorg/json/JSONObject;
    invoke-direct {v5}, Lorg/json/JSONObject;-><init>()V
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getHeaderFields()Ljava/util/Map;
    move-result-object v6
    invoke-interface {v6}, Ljava/util/Map;->entrySet()Ljava/util/Set;
    move-result-object v6
    invoke-interface {v6}, Ljava/util/Set;->iterator()Ljava/util/Iterator;
    move-result-object v6
    :eloop
    invoke-interface {v6}, Ljava/util/Iterator;->hasNext()Z
    move-result v7
    if-eqz v7, :edone
    invoke-interface {v6}, Ljava/util/Iterator;->next()Ljava/lang/Object;
    move-result-object v7
    check-cast v7, Ljava/util/Map$Entry;
    invoke-interface {v7}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;
    move-result-object v1
    if-eqz v1, :eloop
    check-cast v1, Ljava/lang/String;
    invoke-virtual {v1}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;
    move-result-object v1
    invoke-interface {v7}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;
    move-result-object v7
    check-cast v7, Ljava/lang/Iterable;
    const-string v2, ", "
    invoke-static {v2, v7}, Landroid/text/TextUtils;->join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)Ljava/lang/String;
    move-result-object v7
    invoke-virtual {v5, v1, v7}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    goto :eloop
    :edone
    const-string v1, "headers"
    invoke-virtual {v4, v1, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    new-instance v5, Ljava/lang/String;
    const-string v1, "UTF-8"
    invoke-direct {v5, v9, v1}, Ljava/lang/String;-><init>([BLjava/lang/String;)V
    const-string v1, "body"
    invoke-virtual {v4, v1, v5}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    invoke-virtual {v4}, Lorg/json/JSONObject;->toString()Ljava/lang/String;
    move-result-object v4
    const-string v1, "UTF-8"
    invoke-virtual {v4, v1}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B
    move-result-object v4
    const/16 v1, 0xc8
    const-string v2, "application/json"
    invoke-static {v1, v2, v4}, Lapp/fanoos/Proxy;->bytes(ILjava/lang/String;[B)Landroid/webkit/WebResourceResponse;
    move-result-object v4
    return-object v4
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :fail

    :fail
    move-exception v4
    invoke-static {v4}, Ljava/lang/String;->valueOf(Ljava/lang/Object;)Ljava/lang/String;
    move-result-object v4
    const/16 v5, 0x1f6
    invoke-static {v5, v4}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v4
    return-object v4
.end method

# Hand a stream to another app (VLC, MX Player, Kodi, YouTube app…) with ACTION_VIEW.
# No chooser: Android shows its own "Just once / Always" picker when several apps can play it.
.method static open(Landroid/app/Activity;Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    .registers 8
    # p0=v6 activity, p1=v7 request uri; v0 url, v2 intent, v3 data uri, v4 tmp
    :try_start
    const-string v0, "url"
    invoke-virtual {p1, v0}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :blocked
    const-string v1, "http://"
    invoke-virtual {v0, v1}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v1
    if-nez v1, :scheme_ok
    const-string v1, "https://"
    invoke-virtual {v0, v1}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v1
    if-eqz v1, :blocked
    :scheme_ok
    new-instance v2, Landroid/content/Intent;
    const-string v1, "android.intent.action.VIEW"
    invoke-direct {v2, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    invoke-static {v0}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v3
    const-string v1, "type"
    invoke-virtual {p1, v1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    if-eqz v4, :notype
    invoke-virtual {v4}, Ljava/lang/String;->length()I
    move-result v1
    if-eqz v1, :notype
    invoke-virtual {v2, v3, v4}, Landroid/content/Intent;->setDataAndType(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;
    goto :typed
    :notype
    invoke-virtual {v2, v3}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;
    :typed
    # "title" extra: shown by MX Player, VLC and others
    const-string v1, "title"
    invoke-virtual {p1, v1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    if-eqz v4, :pkg
    invoke-virtual {v2, v1, v4}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;
    :pkg
    # "pkg": open exactly this app (org.videolan.vlc, is.xyz.mpv); empty = let Android ask
    const-string v1, "pkg"
    invoke-virtual {p1, v1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    if-eqz v4, :start
    invoke-virtual {v4}, Ljava/lang/String;->length()I
    move-result v1
    if-eqz v1, :start
    invoke-virtual {v2, v4}, Landroid/content/Intent;->setPackage(Ljava/lang/String;)Landroid/content/Intent;
    :start
    invoke-virtual {p0, v2}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V
    const/16 v1, 0xc8
    const-string v4, "ok"
    invoke-static {v1, v4}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1
    :try_end
    .catch Landroid/content/ActivityNotFoundException; {:try_start .. :try_end} :noapp
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :fail

    :blocked
    const/16 v1, 0x190
    const-string v4, "Blocked URL"
    invoke-static {v1, v4}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :noapp
    const/16 v1, 0x194
    const-string v4, "not-installed"
    invoke-static {v1, v4}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :fail
    move-exception v1
    invoke-static {v1}, Ljava/lang/String;->valueOf(Ljava/lang/Object;)Ljava/lang/String;
    move-result-object v4
    const/16 v1, 0x1f6
    invoke-static {v1, v4}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1
.end method
