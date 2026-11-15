# Ad-server blocklist from assets/www/adblock.txt (one host per line; subdomains match too).
.class public Lapp/fanoos/AdBlock;
.super Ljava/lang/Object;

.field private static hosts:Ljava/util/HashSet;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method public static blocked(Landroid/content/Context;Ljava/lang/String;)Z
    .registers 5
    if-nez p1, :go
    const/4 v0, 0x0
    return v0
    :go
    invoke-static {p0}, Lapp/fanoos/AdBlock;->load(Landroid/content/Context;)Ljava/util/HashSet;
    move-result-object v0
    invoke-virtual {p1}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;
    move-result-object v1
    :loop
    invoke-virtual {v0, v1}, Ljava/util/HashSet;->contains(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :next
    const/4 v2, 0x1
    return v2
    :next
    const/16 v2, 0x2e
    invoke-virtual {v1, v2}, Ljava/lang/String;->indexOf(I)I
    move-result v2
    if-gez v2, :strip
    const/4 v2, 0x0
    return v2
    :strip
    add-int/lit8 v2, v2, 0x1
    invoke-virtual {v1, v2}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v1
    goto :loop
.end method

.method private static declared-synchronized load(Landroid/content/Context;)Ljava/util/HashSet;
    .registers 7
    sget-object v0, Lapp/fanoos/AdBlock;->hosts:Ljava/util/HashSet;
    if-eqz v0, :read
    return-object v0
    :read
    new-instance v0, Ljava/util/HashSet;
    invoke-direct {v0}, Ljava/util/HashSet;-><init>()V
    :try_start
    invoke-virtual {p0}, Landroid/content/Context;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v1
    const-string v2, "www/adblock.txt"
    invoke-virtual {v1, v2}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v1
    new-instance v3, Ljava/io/InputStreamReader;
    invoke-direct {v3, v1}, Ljava/io/InputStreamReader;-><init>(Ljava/io/InputStream;)V
    new-instance v2, Ljava/io/BufferedReader;
    invoke-direct {v2, v3}, Ljava/io/BufferedReader;-><init>(Ljava/io/Reader;)V
    :line
    invoke-virtual {v2}, Ljava/io/BufferedReader;->readLine()Ljava/lang/String;
    move-result-object v3
    if-eqz v3, :done
    invoke-virtual {v3}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v3}, Ljava/lang/String;->length()I
    move-result v4
    if-eqz v4, :line
    const/4 v4, 0x0
    invoke-virtual {v3, v4}, Ljava/lang/String;->charAt(I)C
    move-result v4
    const/16 v5, 0x23
    if-eq v4, v5, :line
    invoke-virtual {v0, v3}, Ljava/util/HashSet;->add(Ljava/lang/Object;)Z
    goto :line
    :done
    invoke-virtual {v2}, Ljava/io/BufferedReader;->close()V
    :try_end
    .catch Ljava/lang/Exception; {:try_start .. :try_end} :failed
    :failed
    sput-object v0, Lapp/fanoos/AdBlock;->hosts:Ljava/util/HashSet;
    return-object v0
.end method
