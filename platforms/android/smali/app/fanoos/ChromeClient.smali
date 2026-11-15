# WebChromeClient that answers <input type="file"> with the system file picker (MainActivity.pickFiles).
.class public Lapp/fanoos/ChromeClient;
.super Landroid/webkit/WebChromeClient;

.field private final act:Lapp/fanoos/MainActivity;

.method public constructor <init>(Lapp/fanoos/MainActivity;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, Lapp/fanoos/ChromeClient;->act:Lapp/fanoos/MainActivity;
    return-void
.end method

.method public onShowFileChooser(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z
    .registers 5
    iget-object v0, p0, Lapp/fanoos/ChromeClient;->act:Lapp/fanoos/MainActivity;
    invoke-virtual {v0, p2}, Lapp/fanoos/MainActivity;->pickFiles(Landroid/webkit/ValueCallback;)V
    const/4 v0, 0x1
    return v0
.end method
