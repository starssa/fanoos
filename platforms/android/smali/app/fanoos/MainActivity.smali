# Fullscreen WebView that loads the bundled app from https://appassets.androidplatform.net/
# (served by ShellClient), so storage and crypto behave like a normal https origin.
.class public Lapp/fanoos/MainActivity;
.super Landroid/app/Activity;

.field private web:Landroid/webkit/WebView;

.field private picker:Landroid/webkit/ValueCallback;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 6
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    const/4 v0, 0x1
    invoke-static {v0}, Landroid/webkit/WebView;->setWebContentsDebuggingEnabled(Z)V

    new-instance v1, Landroid/webkit/WebView;
    invoke-direct {v1, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v1, p0, Lapp/fanoos/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {v1}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v2
    invoke-virtual {v2, v0}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v2, v0}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    const/4 v3, 0x0
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    # MIXED_CONTENT_ALWAYS_ALLOW (0): extensions may hand out http:// streams
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V

    new-instance v2, Lapp/fanoos/ShellClient;
    invoke-direct {v2, p0}, Lapp/fanoos/ShellClient;-><init>(Landroid/app/Activity;)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v2, Lapp/fanoos/ChromeClient;
    invoke-direct {v2, p0}, Lapp/fanoos/ChromeClient;-><init>(Lapp/fanoos/MainActivity;)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    invoke-virtual {p0, v1}, Lapp/fanoos/MainActivity;->setContentView(Landroid/view/View;)V
    invoke-virtual {v1}, Landroid/webkit/WebView;->requestFocus()Z

    const-string v2, "https://appassets.androidplatform.net/index.html?shell=android"
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void
.end method

# <input type="file">: open the system picker (any type, several files allowed); onActivityResult answers.
.method public pickFiles(Landroid/webkit/ValueCallback;)V
    .registers 6
    iget-object v0, p0, Lapp/fanoos/MainActivity;->picker:Landroid/webkit/ValueCallback;
    const/4 v1, 0x0
    if-eqz v0, :fresh
    invoke-interface {v0, v1}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V
    :fresh
    iput-object p1, p0, Lapp/fanoos/MainActivity;->picker:Landroid/webkit/ValueCallback;
    new-instance v0, Landroid/content/Intent;
    const-string v2, "android.intent.action.GET_CONTENT"
    invoke-direct {v0, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V
    const-string v2, "android.intent.category.OPENABLE"
    invoke-virtual {v0, v2}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;
    const-string v2, "*/*"
    invoke-virtual {v0, v2}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;
    const-string v2, "android.intent.extra.ALLOW_MULTIPLE"
    const/4 v3, 0x1
    invoke-virtual {v0, v2, v3}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Z)Landroid/content/Intent;
    # Start in Downloads (system picker), and offer installed file managers too: on TVs the system
    # picker's folder menu can't be reached with the remote, a TV file manager can.
    const-string v2, "android.provider.extra.INITIAL_URI"
    const-string v3, "content://com.android.externalstorage.documents/document/primary%3ADownload"
    invoke-static {v3}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v3
    invoke-virtual {v0, v2, v3}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Landroid/os/Parcelable;)Landroid/content/Intent;
    const-string v2, "Choose a file"
    invoke-static {v0, v2}, Landroid/content/Intent;->createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;
    move-result-object v0
    :try_start
    const/16 v2, 0x2a
    invoke-virtual {p0, v0, v2}, Lapp/fanoos/MainActivity;->startActivityForResult(Landroid/content/Intent;I)V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :nopicker
    return-void
    :nopicker
    iput-object v1, p0, Lapp/fanoos/MainActivity;->picker:Landroid/webkit/ValueCallback;
    invoke-interface {p1, v1}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V
    return-void
.end method

# The picked file(s) go back to the page; cancelled: null.
.method protected onActivityResult(IILandroid/content/Intent;)V
    .registers 12
    # p0=v8 this, p1=v9 request, p2=v10 result, p3=v11 data
    invoke-super {p0, p1, p2, p3}, Landroid/app/Activity;->onActivityResult(IILandroid/content/Intent;)V
    const/16 v0, 0x2a
    if-ne p1, v0, :done
    iget-object v0, p0, Lapp/fanoos/MainActivity;->picker:Landroid/webkit/ValueCallback;
    if-eqz v0, :done
    const/4 v1, 0x0
    iput-object v1, p0, Lapp/fanoos/MainActivity;->picker:Landroid/webkit/ValueCallback;
    const/4 v2, -0x1
    if-ne p2, v2, :answer
    if-eqz p3, :answer
    invoke-virtual {p3}, Landroid/content/Intent;->getClipData()Landroid/content/ClipData;
    move-result-object v3
    if-eqz v3, :single
    invoke-virtual {v3}, Landroid/content/ClipData;->getItemCount()I
    move-result v4
    new-array v1, v4, [Landroid/net/Uri;
    const/4 v5, 0x0
    :loop
    if-ge v5, v4, :answer
    invoke-virtual {v3, v5}, Landroid/content/ClipData;->getItemAt(I)Landroid/content/ClipData$Item;
    move-result-object v6
    invoke-virtual {v6}, Landroid/content/ClipData$Item;->getUri()Landroid/net/Uri;
    move-result-object v6
    aput-object v6, v1, v5
    add-int/lit8 v5, v5, 0x1
    goto :loop
    :single
    invoke-virtual {p3}, Landroid/content/Intent;->getData()Landroid/net/Uri;
    move-result-object v3
    if-eqz v3, :answer
    const/4 v4, 0x1
    new-array v1, v4, [Landroid/net/Uri;
    const/4 v4, 0x0
    aput-object v3, v1, v4
    :answer
    invoke-interface {v0, v1}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V
    :done
    return-void
.end method

# Back / remote Return key: let the web app decide (close player, go back, or exit).
.method public onBackPressed()V
    .registers 4
    iget-object v0, p0, Lapp/fanoos/MainActivity;->web:Landroid/webkit/WebView;
    const-string v1, "window.fanoosBack ? window.fanoosBack() : 0"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    return-void
.end method
