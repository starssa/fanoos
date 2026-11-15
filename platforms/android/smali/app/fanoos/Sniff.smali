# The watcher's recorder: while on (GET /__sniff/start … /__sniff/stop), every request a frame makes for a video
# file (.m3u8/.mp4/.mpd) is noted with its Referer; GET /__sniff/poll answers them as JSON [{url, ref}].
.class public Lapp/fanoos/Sniff;
.super Ljava/lang/Object;

.field static volatile on:Z
.field static final found:Ljava/util/concurrent/CopyOnWriteArrayList;

.method static constructor <clinit>()V
    .registers 1
    new-instance v0, Ljava/util/concurrent/CopyOnWriteArrayList;
    invoke-direct {v0}, Ljava/util/concurrent/CopyOnWriteArrayList;-><init>()V
    sput-object v0, Lapp/fanoos/Sniff;->found:Ljava/util/concurrent/CopyOnWriteArrayList;
    return-void
.end method

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method static see(Landroid/webkit/WebResourceRequest;)V
    .registers 6
    sget-boolean v0, Lapp/fanoos/Sniff;->on:Z
    if-eqz v0, :done
    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->isForMainFrame()Z
    move-result v0
    if-nez v0, :done
    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :done
    invoke-virtual {v1}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;
    move-result-object v1
    const-string v2, ".*\\.(m3u8|mp4|mpd)$"
    invoke-virtual {v1, v2}, Ljava/lang/String;->matches(Ljava/lang/String;)Z
    move-result v1
    if-eqz v1, :done
    :try_start
    new-instance v1, Lorg/json/JSONObject;
    invoke-direct {v1}, Lorg/json/JSONObject;-><init>()V
    const-string v2, "url"
    invoke-virtual {v0}, Landroid/net/Uri;->toString()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v1, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    invoke-interface {p0}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;
    move-result-object v2
    if-eqz v2, :noref
    const-string v3, "Referer"
    invoke-interface {v2, v3}, Ljava/util/Map;->get(Ljava/lang/Object;)Ljava/lang/Object;
    move-result-object v2
    if-eqz v2, :noref
    const-string v3, "ref"
    invoke-virtual {v1, v3, v2}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;
    :noref
    sget-object v2, Lapp/fanoos/Sniff;->found:Ljava/util/concurrent/CopyOnWriteArrayList;
    invoke-virtual {v2, v1}, Ljava/util/concurrent/CopyOnWriteArrayList;->add(Ljava/lang/Object;)Z
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :done
    :done
    return-void
.end method

.method static route(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    .registers 5
    invoke-virtual {p0}, Landroid/net/Uri;->getPath()Ljava/lang/String;
    move-result-object v0
    sget-object v1, Lapp/fanoos/Sniff;->found:Ljava/util/concurrent/CopyOnWriteArrayList;
    const-string v2, "/__sniff/start"
    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :not_start
    invoke-virtual {v1}, Ljava/util/concurrent/CopyOnWriteArrayList;->clear()V
    const/4 v3, 0x1
    sput-boolean v3, Lapp/fanoos/Sniff;->on:Z
    goto :ok
    :not_start
    const-string v2, "/__sniff/stop"
    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :poll
    const/4 v3, 0x0
    sput-boolean v3, Lapp/fanoos/Sniff;->on:Z
    invoke-virtual {v1}, Ljava/util/concurrent/CopyOnWriteArrayList;->clear()V
    goto :ok
    :poll
    new-instance v2, Lorg/json/JSONArray;
    invoke-direct {v2, v1}, Lorg/json/JSONArray;-><init>(Ljava/util/Collection;)V
    invoke-virtual {v2}, Lorg/json/JSONArray;->toString()Ljava/lang/String;
    move-result-object v2
    const/16 v3, 0xc8
    invoke-static {v3, v2}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v2
    return-object v2
    :ok
    const/16 v3, 0xc8
    const-string v2, "ok"
    invoke-static {v3, v2}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v2
    return-object v2
.end method
