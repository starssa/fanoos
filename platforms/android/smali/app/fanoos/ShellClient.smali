# Routes requests for https://appassets.androidplatform.net/ :
#   /__proxy  -> Proxy.handle (native HTTP for extensions, no CORS)
#   /__open   -> Proxy.open (hand the stream to an external player app)
#   /__exit   -> finish the activity
#   anything else -> file from assets/www
# shouldInterceptRequest runs on a WebView background thread, so blocking I/O here is fine.
.class public Lapp/fanoos/ShellClient;
.super Landroid/webkit/WebViewClient;

.field private final act:Landroid/app/Activity;

# A heavy player page can get the browser engine killed (out of memory). Without this Android closes Fanoos;
# with it Fanoos starts again.
.method public onRenderProcessGone(Landroid/webkit/WebView;Landroid/webkit/RenderProcessGoneDetail;)Z
    .registers 5
    # the dead WebView must not be used again: take it out and destroy it, then start fresh
    invoke-virtual {p1}, Landroid/webkit/WebView;->getParent()Landroid/view/ViewParent;
    move-result-object v0
    instance-of v1, v0, Landroid/view/ViewGroup;
    if-eqz v1, :gone
    check-cast v0, Landroid/view/ViewGroup;
    invoke-virtual {v0, p1}, Landroid/view/ViewGroup;->removeView(Landroid/view/View;)V
    :gone
    invoke-virtual {p1}, Landroid/webkit/WebView;->destroy()V
    iget-object v0, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    invoke-virtual {v0}, Landroid/app/Activity;->recreate()V
    const/4 v0, 0x1
    return v0
.end method

.method public constructor <init>(Landroid/app/Activity;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    iput-object p1, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    return-void
.end method

# Player pages (no sandbox) may try to send the whole app to an ad: only our own pages may load in the main frame.
.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z
    .registers 6
    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->isForMainFrame()Z
    move-result v0
    if-eqz v0, :allow
    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v0
    const-string v1, "appassets.androidplatform.net"
    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v0
    if-nez v0, :allow
    const/4 v0, 0x1
    return v0
    :allow
    const/4 v0, 0x0
    return v0
.end method

.method public shouldInterceptRequest(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .registers 7
    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v1
    const-string v2, "appassets.androidplatform.net"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v1
    if-nez v1, :ours
    # The watcher notes video file requests made by frames (no-op unless it is on).
    :sniff_try
    invoke-static {p2}, Lapp/fanoos/Sniff;->see(Landroid/webkit/WebResourceRequest;)V
    :sniff_end
    .catch Ljava/lang/Throwable; {:sniff_try .. :sniff_end} :sniff_done
    :sniff_done
    # Requests to ad servers (player frames included) get an empty 403 instead.
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v1
    iget-object v2, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    :block_try
    invoke-static {v2, v1}, Lapp/fanoos/AdBlock;->blocked(Landroid/content/Context;Ljava/lang/String;)Z
    move-result v1
    :block_end
    .catch Ljava/lang/Throwable; {:block_try .. :block_end} :pass
    if-eqz v1, :pass
    const/16 v2, 0x193
    const-string v3, ""
    invoke-static {v2, v3}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1
    :pass
    # hosts that need their player's Referer (registered by Fanoos before playing)
    :ref_try
    invoke-static {p2}, Lapp/fanoos/RefStream;->open(Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1
    :ref_end
    .catch Ljava/lang/Throwable; {:ref_try .. :ref_end} :ref_failed
    :ref_failed
    const/4 v1, 0x0
    return-object v1

    :ours
    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;
    move-result-object v1

    const-string v2, "/__proxy"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :not_proxy
    invoke-static {v0}, Lapp/fanoos/Proxy;->handle(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :not_proxy
    const-string v2, "/__open"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :not_open
    iget-object v2, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    invoke-static {v2, v0}, Lapp/fanoos/Proxy;->open(Landroid/app/Activity;Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :not_open
    const-string v2, "/__referer"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :not_referer
    invoke-static {v0}, Lapp/fanoos/RefStream;->register(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :not_referer
    const-string v2, "/__sniff/"
    invoke-virtual {v1, v2}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
    move-result v2
    if-eqz v2, :not_sniff
    invoke-static {v0}, Lapp/fanoos/Sniff;->route(Landroid/net/Uri;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :not_sniff
    const-string v2, "/__streamport"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :not_streamport
    invoke-static {}, Lapp/fanoos/LocalProxy;->port()I
    move-result v2
    invoke-static {v2}, Ljava/lang/String;->valueOf(I)Ljava/lang/String;
    move-result-object v3
    const/16 v2, 0xc8
    invoke-static {v2, v3}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :not_streamport
    const-string v2, "/__exit"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :asset
    iget-object v2, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    invoke-virtual {v2}, Landroid/app/Activity;->finish()V
    const/16 v2, 0xc8
    const-string v3, "bye"
    invoke-static {v2, v3}, Lapp/fanoos/Proxy;->text(ILjava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1

    :asset
    iget-object v2, p0, Lapp/fanoos/ShellClient;->act:Landroid/app/Activity;
    invoke-static {v2, v1}, Lapp/fanoos/Proxy;->asset(Landroid/content/Context;Ljava/lang/String;)Landroid/webkit/WebResourceResponse;
    move-result-object v1
    return-object v1
.end method
