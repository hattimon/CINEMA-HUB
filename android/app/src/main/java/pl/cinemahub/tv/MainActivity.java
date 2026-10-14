package pl.cinemahub.tv;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.TimeBar;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.net.URLDecoder;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

@UnstableApi
public class MainActivity extends Activity {
    private static final String RELEASE_API="https://api.github.com/repos/hattimon/CINEMA-HUB/releases/latest";
    private static final String UPDATE_ACTION="pl.cinemahub.tv.UPDATE_INSTALL_RESULT";
    private static final Pattern APK_VERSION=Pattern.compile("^CinemaHub-AndroidTV-v([0-9]+\\.[0-9]+\\.[0-9]+)\\.apk$");
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService updateExecutor=Executors.newSingleThreadExecutor();
    private FrameLayout root,playerLayer;
    private LinearLayout nativeTitle,nativeActions,nativeMenu;
    private Button nativeAutoplay,nativeHost,nativeSources,nativePause,nativeFullscreen;
    private DefaultTimeBar nativeTimeBar;
    private TextView nativeTimeText;
    private boolean scrubbing;
    private boolean playerFullscreen,webPanel,series;
    private boolean autoAdvance,canNext,canPrevious,preferManualHost;
    private WebView web,loginWeb;
    private Dialog loginDialog;
    private SharedPreferences preferences;
    private Button menuButton;
    private String server,playbackId;
    private View customView,errorView;
    private WebChromeClient.CustomViewCallback customCallback;
    private ExoPlayer player;
    private PlayerView playerView;
    private JavaScriptReplyProxy playerReply;
    private ValueCallback<Uri[]> fileChooser;
    private String[] pendingDownload;
    private boolean cursorMode,pausedByLifecycle,mainLoadFailed;
    private boolean updateCheckStarted,updateDownloadStarted,waitingForInstallPermission;
    private File pendingUpdateFile;
    private AlertDialog updateProgressDialog;
    private View cursor;
    private float cursorX,cursorY;
    private final Runnable progressTick=new Runnable(){public void run(){if(player!=null){sendProgress(false);handler.postDelayed(this,5000);}}};
    private final Runnable timelineTick=new Runnable(){public void run(){if(player!=null){updateTimeline();handler.postDelayed(this,1000);}}};
    private final Runnable hideNativeOverlay=()->hideNativeControls();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        preferences=getSharedPreferences("cinema-client",MODE_PRIVATE);
        server=preferences.getString("server",ServerAddress.DEFAULT);
        cursorMode=preferences.getBoolean("cursor",false);
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(11,13,18));setContentView(root);
        createWeb();immersive();
        if(!preferences.getBoolean("configured",false))handler.postDelayed(this::editServer,300);
        handler.postDelayed(()->checkForUpdates(false),5000);
    }

    private static final class AppUpdate {
        final String version,url,sha256;
        AppUpdate(String version,String url,String sha256){this.version=version;this.url=url;this.sha256=sha256;}
    }

    private String installedVersion(){
        try{String version=getPackageManager().getPackageInfo(getPackageName(),0).versionName;return version==null||version.trim().isEmpty()?"0.0.0":version;}catch(Exception ignored){return "0.0.0";}
    }

    private AppUpdate findUpdate(String currentVersion)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(RELEASE_API).openConnection();
        connection.setConnectTimeout(8000);connection.setReadTimeout(10000);connection.setRequestProperty("Accept","application/vnd.github+json");connection.setRequestProperty("User-Agent","CinemaHubTV");
        try{
            if(connection.getResponseCode()!=200)throw new java.io.IOException("GitHub update check failed");
            JSONObject release=new JSONObject(new String(readLimited(connection.getInputStream(),1024*1024),java.nio.charset.StandardCharsets.UTF_8));
            if(release.optBoolean("draft")||release.optBoolean("prerelease"))return null;
            org.json.JSONArray assets=release.optJSONArray("assets");if(assets==null)return null;
            for(int index=0;index<assets.length();index++){
                JSONObject asset=assets.optJSONObject(index);if(asset==null)continue;
                Matcher match=APK_VERSION.matcher(asset.optString("name"));if(!match.matches())continue;
                String version=match.group(1);if(!AppVersion.isNewer(version,currentVersion))continue;
                String url=asset.optString("browser_download_url");String digest=asset.optString("digest");
                Uri download=Uri.parse(url);if(!"https".equals(download.getScheme())||!"github.com".equals(download.getHost())||!download.getPath().startsWith("/hattimon/CINEMA-HUB/releases/download/")||!digest.matches("(?i)^sha256:[0-9a-f]{64}$"))throw new java.io.IOException("Invalid Cinema Hub release asset");
                return new AppUpdate(version,url,digest.substring(7).toLowerCase(Locale.ROOT));
            }
            return null;
        }finally{connection.disconnect();}
    }

    private void checkForUpdates(boolean manual){
        if(updateCheckStarted){if(manual)Toast.makeText(this,"Sprawdzam dostępność aktualizacji…",Toast.LENGTH_SHORT).show();return;}
        updateCheckStarted=true;String current=installedVersion();
        updateExecutor.execute(()->{
            AppUpdate update=null;boolean failed=false;
            try{update=findUpdate(current);}catch(Exception ignored){failed=true;}
            final AppUpdate found=update;final boolean checkFailed=failed;
            handler.post(()->{
                updateCheckStarted=false;if(isFinishing()||isDestroyed())return;
                if(found!=null){
                    new AlertDialog.Builder(this).setTitle("Dostępna aktualizacja Cinema Hub").setMessage("Na urządzeniu: "+current+"\nNajnowsza wersja: "+found.version+"\n\nPobrać i zainstalować aktualizację na tym urządzeniu?").setPositiveButton("Pobierz i zainstaluj",(dialog,which)->downloadUpdate(found)).setNegativeButton("Później",null).show();
                }else if(manual){
                    String message=checkFailed?"Nie udało się sprawdzić aktualizacji. Sprawdź połączenie internetowe.":"Masz najnowszą wersję Cinema Hub ("+current+").";
                    Toast.makeText(this,message,Toast.LENGTH_LONG).show();
                }
            });
        });
    }

    private void downloadUpdate(AppUpdate update){
        if(updateDownloadStarted)return;updateDownloadStarted=true;
        updateProgressDialog=new AlertDialog.Builder(this).setTitle("Aktualizacja Cinema Hub").setMessage("Pobieram wersję "+update.version+" i sprawdzam jej sumę kontrolną…").setCancelable(false).create();updateProgressDialog.show();
        updateExecutor.execute(()->{
            File apk=null,partial=null;boolean failed=false;
            try{
                File directory=new File(getCacheDir(),"updates");if(!directory.isDirectory()&&!directory.mkdirs())throw new java.io.IOException("Cannot create update cache");
                apk=new File(directory,"CinemaHub-AndroidTV-v"+update.version+".apk");partial=new File(apk.getPath()+".part");
                HttpURLConnection connection=(HttpURLConnection)new URL(update.url).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(30000);connection.setInstanceFollowRedirects(true);connection.setRequestProperty("User-Agent","CinemaHubTV");
                try{
                    if(connection.getResponseCode()!=200)throw new java.io.IOException("APK download failed");
                    long expectedSize=connection.getContentLength();if(expectedSize>60L*1024*1024)throw new java.io.IOException("APK is too large");
                    MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0;byte[] buffer=new byte[32768];
                    try(InputStream input=connection.getInputStream();FileOutputStream output=new FileOutputStream(partial)){
                        int count;while((count=input.read(buffer))!=-1){total+=count;if(total>60L*1024*1024)throw new java.io.IOException("APK is too large");digest.update(buffer,0,count);output.write(buffer,0,count);}
                    }
                    if(total==0||expectedSize>0&&total!=expectedSize||!toHex(digest.digest()).equals(update.sha256))throw new java.io.IOException("APK checksum or size did not match");
                    if(apk.exists()&&!apk.delete())throw new java.io.IOException("Cannot replace cached APK");
                    if(!partial.renameTo(apk))throw new java.io.IOException("Cannot finalize downloaded APK");
                    PackageInfo archive=getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(),0);
                    if(archive==null||!getPackageName().equals(archive.packageName)||!update.version.equals(archive.versionName)||!AppVersion.isNewer(archive.versionName,currentInstalledVersion()))throw new java.io.IOException("Downloaded APK is not a newer Cinema Hub version");
                }finally{connection.disconnect();}
            }catch(Exception ignored){failed=true;if(partial!=null)partial.delete();if(apk!=null)apk.delete();}
            final File downloaded=apk;final boolean downloadFailed=failed;
            handler.post(()->{
                updateDownloadStarted=false;if(updateProgressDialog!=null){updateProgressDialog.dismiss();updateProgressDialog=null;}if(isFinishing()||isDestroyed())return;
                if(downloadFailed||downloaded==null){Toast.makeText(this,"Nie udało się pobrać i zweryfikować aktualizacji.",Toast.LENGTH_LONG).show();return;}
                pendingUpdateFile=downloaded;requestUpdateInstall();
            });
        });
    }

    private String currentInstalledVersion(){return installedVersion();}

    private static byte[] readLimited(InputStream input,int maximum)throws java.io.IOException{
        try(InputStream source=input;ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;while((count=source.read(buffer))!=-1){if(output.size()+count>maximum)throw new java.io.IOException("Response is too large");output.write(buffer,0,count);}return output.toByteArray();
        }
    }

    private static String toHex(byte[] bytes){StringBuilder value=new StringBuilder(bytes.length*2);for(byte item:bytes)value.append(String.format(Locale.ROOT,"%02x",item&0xff));return value.toString();}

    private void requestUpdateInstall(){
        if(pendingUpdateFile==null||!pendingUpdateFile.isFile())return;
        if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(this).setTitle("Zezwól na aktualizację").setMessage("Android wymaga jednorazowego zezwolenia na instalowanie aktualizacji pobranych przez Cinema Hub. W następnym ekranie włącz „Zezwalaj z tego źródła”, a instalator uruchomi się po powrocie.").setPositiveButton("Otwórz ustawienia",(dialog,which)->{
                waitingForInstallPermission=true;try{startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));}catch(Exception error){waitingForInstallPermission=false;Toast.makeText(this,"Nie można otworzyć ustawień instalacji aplikacji.",Toast.LENGTH_LONG).show();}
            }).setNegativeButton("Później",null).show();return;
        }
        installUpdate(pendingUpdateFile);
    }

    private void installUpdate(File apk){
        try{
            PackageInstaller installer=getPackageManager().getPackageInstaller();PackageInstaller.SessionParams parameters=new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            if(Build.VERSION.SDK_INT>=29)parameters.setAppPackageName(getPackageName());
            int sessionId=installer.createSession(parameters);
            try(PackageInstaller.Session session=installer.openSession(sessionId)){
                try(FileInputStream input=new FileInputStream(apk);OutputStream output=session.openWrite("base.apk",0,apk.length())){
                    byte[] buffer=new byte[32768];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);session.fsync(output);
                }
                Intent callback=new Intent(this,UpdateInstallReceiver.class).setAction(UPDATE_ACTION).setData(Uri.parse("cinemahub-update:"+sessionId));
                int flags=PendingIntent.FLAG_UPDATE_CURRENT;if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;
                PendingIntent status=PendingIntent.getBroadcast(this,sessionId,callback,flags);session.commit(status.getIntentSender());
            }
            Toast.makeText(this,"Aktualizacja przekazana do instalatora Androida.",Toast.LENGTH_LONG).show();
        }catch(Exception error){Toast.makeText(this,"Android nie mógł rozpocząć instalacji. Zachowano pobrany plik aktualizacji.",Toast.LENGTH_LONG).show();}
    }

    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void immersive(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)immersive();}

    private void createWeb() {
        if(loginDialog!=null)loginDialog.dismiss();hideCustom();closePlayer(false,false);
        if(web!=null){root.removeView(web);web.destroy();}
        if(errorView!=null){root.removeView(errorView);errorView=null;}
        try {
            web=new WebView(this);configure(web);root.addView(web,0,new FrameLayout.LayoutParams(-1,-1));
            if(menuButton==null){menuButton=new Button(this);menuButton.setText("≡");menuButton.setTextColor(Color.rgb(162,138,255));menuButton.setContentDescription("Menu klienta Cinema Hub");menuButton.setOnClickListener(v->menu());FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(dp(48),dp(42),Gravity.TOP|Gravity.END);p.setMargins(0,dp(4),dp(6),0);root.addView(menuButton,p);}
            if(cursor==null){cursor=new View(this);cursor.setBackgroundResource(android.R.drawable.presence_online);root.addView(cursor,new FrameLayout.LayoutParams(dp(20),dp(20)));}
            cursor.setVisibility(cursorMode?View.VISIBLE:View.GONE);root.post(()->{cursorX=root.getWidth()/2f;cursorY=root.getHeight()/2f;moveCursor();});
            menuButton.bringToFront();cursor.bringToFront();web.loadUrl(server);web.requestFocus();
        }catch(Exception error){showError("Nie można otworzyć panelu. Sprawdź systemowy Android WebView na projektorze.");}
    }

    private void configure(WebView view) {
        WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString()+" CinemaHubTV/1.3.3");if(Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(view,false);
        view.setFocusable(true);view.setFocusableInTouchMode(true);view.setBackgroundColor(Color.rgb(11,13,18));
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return !allowed(r.getUrl().toString());}
            @Override public boolean shouldOverrideUrlLoading(WebView w,String address){return !allowed(address);}
            private boolean allowed(String address){if("about:blank".equals(address)||ServerAddress.owns(server,address))return true;Toast.makeText(MainActivity.this,"Ten adres jest poza wybranym serwerem Cinema Hub.",Toast.LENGTH_SHORT).show();return false;}
            @Override public void onPageStarted(WebView w,String address,android.graphics.Bitmap icon){if(w==web)mainLoadFailed=false;}
            @Override public void onPageFinished(WebView w,String address){if(w==web&&!mainLoadFailed&&ServerAddress.owns(server,address)){if(errorView!=null){root.removeView(errorView);errorView=null;}CookieManager.getInstance().flush();immersive();}}
            @Override public void onReceivedError(WebView w,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()&&w==web){mainLoadFailed=true;showError("Brak połączenia z serwerem. Sprawdź adres, port i dostęp projektora do tej sieci.");}}
            @Override public void onReceivedHttpError(WebView w,WebResourceRequest r,WebResourceResponse response){if(r.isForMainFrame()&&w==web){mainLoadFailed=true;showError("Serwer odpowiedział błędem HTTP "+response.getStatusCode()+".");}}
            @Override public void onReceivedSslError(WebView w,SslErrorHandler h,SslError e){h.cancel();if(w==web){mainLoadFailed=true;showError("Serwer HTTPS ma nieprawidłowy certyfikat. Popraw certyfikat lub wpisz właściwy adres serwera w sieci lokalnej.");}}
            @Override public boolean onRenderProcessGone(WebView w,RenderProcessGoneDetail detail){root.removeView(w);w.destroy();if(w==web){web=null;showError("Android WebView zakończył działanie. Użyj Ponów, aby otworzyć panel.");}return true;}
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public void onShowCustomView(View v,CustomViewCallback callback){if(customView!=null){callback.onCustomViewHidden();return;}customView=v;customCallback=callback;root.addView(v,new FrameLayout.LayoutParams(-1,-1));menuButton.setVisibility(View.GONE);cursor.setVisibility(View.GONE);immersive();}
            @Override public void onHideCustomView(){hideCustom();}
            @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileChooser!=null)fileChooser.onReceiveValue(null);fileChooser=callback;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("video/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(intent,10);}catch(Exception error){fileChooser.onReceiveValue(null);fileChooser=null;Toast.makeText(MainActivity.this,"Zainstaluj systemowy menedżer plików obsługujący wybór pliku.",Toast.LENGTH_LONG).show();}return true;}
            @Override public boolean onCreateWindow(WebView w,boolean dialog,boolean gesture,android.os.Message message){if(!gesture||loginDialog!=null)return false;loginWeb=new WebView(MainActivity.this);configure(loginWeb);loginDialog=new Dialog(MainActivity.this);loginDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);loginDialog.setContentView(loginWeb);loginDialog.setOnDismissListener(d->{if(loginWeb!=null)loginWeb.destroy();loginWeb=null;loginDialog=null;CookieManager.getInstance().flush();});loginDialog.show();loginDialog.getWindow().setLayout(-1,-1);WebView.WebViewTransport transport=(WebView.WebViewTransport)message.obj;transport.setWebView(loginWeb);message.sendToTarget();return true;}
            @Override public void onCloseWindow(WebView w){if(w==loginWeb&&loginDialog!=null)loginDialog.dismiss();}
        });
        view.setDownloadListener((url,agent,disposition,mime,length)->download(url,agent,disposition,mime));
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(view,"CinemaNative",Collections.singleton(ServerAddress.origin(server)),(w,message,origin,mainFrame,reply)->{
            if(!mainFrame||w!=web||!ServerAddress.owns(server,origin.toString()))return;
            try{JSONObject data=new JSONObject(message.getData());String type=data.optString("type"),id=data.optString("playbackId");if(!ServerAddress.isPlaybackId(id))return;if(type.equals("play"))openPlayer(data,reply);else if(id.equals(playbackId)){if(type.equals("stop"))closePlayer(false,false);else if(type.equals("settings"))updatePlayerSettings(data);else if(type.equals("fullscreen"))setPlayerFullscreen(data.optBoolean("enabled"));else if(type.equals("panel"))setWebPanel(data.optBoolean("open"));else if(type.equals("transport")&&player!=null){String action=data.optString("action");if(action.equals("toggle"))togglePause();else if(action.equals("pause"))player.pause();else if(action.equals("play"))player.play();else if(action.equals("seek"))seekBy(Math.max(-60000,Math.min(60000,data.optLong("delta"))));else if(action.equals("seekTo"))seekToPosition(data.optLong("position"));}}}catch(Exception error){Toast.makeText(this,"Nie można wykonać tej operacji odtwarzacza.",Toast.LENGTH_SHORT).show();}
        });
    }

    private void openPlayer(JSONObject data,JavaScriptReplyProxy reply) {
        closePlayer(false,false);playbackId=data.optString("playbackId");playerReply=reply;playerFullscreen=data.optBoolean("fullscreen",false);series=data.optBoolean("series",false);webPanel=false;pausedByLifecycle=false;
        updatePlayerSettings(data);
        HashMap<String,String> headers=new HashMap<>();String cookies=CookieManager.getInstance().getCookie(server);if(cookies!=null)headers.put("Cookie",cookies);
        DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setConnectTimeoutMs(20000).setReadTimeoutMs(25000).setDefaultRequestProperties(headers).setUserAgent(web.getSettings().getUserAgentString());
        DefaultMediaSourceFactory media=new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this,http));
        player=new ExoPlayer.Builder(this).setMediaSourceFactory(media).setLoadControl(new DefaultLoadControl.Builder().setBufferDurationsMs(10000,30000,1500,3000).setBackBuffer(5000,false).build()).build();
        player.setAudioAttributes(new androidx.media3.common.AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);
        playerLayer=new FrameLayout(this);playerLayer.setBackgroundColor(Color.BLACK);
        playerView=new PlayerView(this);playerView.setFocusable(true);playerView.setFocusableInTouchMode(true);playerView.setPlayer(player);playerView.setUseController(false);playerView.setOnClickListener(v->togglePause());playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);playerLayer.addView(playerView,new FrameLayout.LayoutParams(-1,-1));
        createNativeControls(data.optString("title"),data.optString("subtitle"));
        root.addView(playerLayer,new FrameLayout.LayoutParams(-1,-1));menuButton.setVisibility(View.GONE);cursor.setVisibility(View.GONE);playerView.requestFocus();immersive();
        refreshNativeControls(true);
        final ExoPlayer sessionPlayer=player;
        player.addListener(new Player.Listener(){
            @Override public void onPlaybackStateChanged(int state){if(player!=sessionPlayer)return;if(state==Player.STATE_READY){if(rejectShortVideo())return;sendProgress(false);}if(state==Player.STATE_ENDED)closePlayer(true,true);}
            @Override public void onTimelineChanged(androidx.media3.common.Timeline timeline,int reason){if(player==sessionPlayer)rejectShortVideo();}
            @Override public void onIsPlayingChanged(boolean playing){if(player==sessionPlayer)sendProgress(false);}
            @Override public void onPlayWhenReadyChanged(boolean ready,int reason){if(player!=sessionPlayer)return;refreshNativeControls(!ready);sendProgress(false);}
            @Override public void onPlayerError(PlaybackException error){if(player!=sessionPlayer)return;JSONObject result=event("error");try{result.put("message","Źródło nie uruchomiło się na Androidzie ("+error.getErrorCodeName()+"). Sprawdź połączenie lub ręcznie wybierz inny hosting.");}catch(Exception ignored){}post(result);closePlayer(false,false);}
        });
        MediaItem.Builder item=new MediaItem.Builder().setUri(server+"api/playback/"+playbackId+"/media");if(data.optString("kind").equals("hls"))item.setMimeType(MimeTypes.APPLICATION_M3U8);
        player.setMediaItem(item.build());player.seekTo(Math.max(0,(long)(data.optDouble("position",0)*1000)));player.prepare();player.play();handler.postDelayed(progressTick,5000);handler.post(timelineTick);
    }

    private void updatePlayerSettings(JSONObject data) {
        autoAdvance=data.optBoolean("autoAdvance",autoAdvance);
        canNext=data.optBoolean("canNext",canNext);
        canPrevious=data.optBoolean("canPrevious",canPrevious);
        preferManualHost=data.optBoolean("preferManualHost",preferManualHost);
        playerFullscreen=data.optBoolean("fullscreen",playerFullscreen);
        if(nativeAutoplay!=null)nativeAutoplay.setText("Autoplay: "+(autoAdvance?"WŁ.":"WYŁ."));
        if(nativeHost!=null)nativeHost.setText("Ten hosting: "+(preferManualHost?"TAK":"NIE"));
        refreshNativeControls(false);
    }

    private Button action(String label,LinearLayout row,Runnable onClick) {
        Button button=new Button(this);button.setText(label);button.setTextColor(Color.WHITE);button.setTextSize(12);button.setAllCaps(false);
        StateListDrawable background=new StateListDrawable();
        GradientDrawable focused=new GradientDrawable();focused.setColor(Color.rgb(57,50,90));focused.setCornerRadius(dp(7));focused.setStroke(dp(3),Color.rgb(186,162,255));
        GradientDrawable normal=new GradientDrawable();normal.setColor(Color.rgb(42,47,68));normal.setCornerRadius(dp(7));normal.setStroke(dp(1),Color.rgb(82,90,113));
        background.addState(new int[]{android.R.attr.state_focused},focused);background.addState(new int[]{android.R.attr.state_pressed},focused);background.addState(new int[]{},normal);button.setBackground(background);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,dp(44));p.setMargins(dp(3),0,dp(3),0);row.addView(button,p);
        button.setOnClickListener(v->{onClick.run();if(player!=null)refreshNativeControls(false);});return button;
    }

    private void createNativeControls(String title,String subtitle) {
        nativeTitle=new LinearLayout(this);nativeTitle.setOrientation(LinearLayout.HORIZONTAL);nativeTitle.setGravity(Gravity.CENTER_VERTICAL);
        nativeTitle.setBackgroundColor(0xCC111522);nativeTitle.setPadding(dp(14),dp(5),dp(12),dp(5));
        LinearLayout labels=new LinearLayout(this);labels.setOrientation(LinearLayout.VERTICAL);
        TextView heading=new TextView(this);heading.setText(title);heading.setTextColor(Color.WHITE);heading.setTextSize(16);heading.setMaxLines(1);
        TextView details=new TextView(this);details.setText(subtitle);details.setTextColor(0xFFBCC8E3);details.setTextSize(11);details.setMaxLines(1);
        labels.addView(heading);labels.addView(details);nativeTitle.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
        playerLayer.addView(nativeTitle,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));

        nativeMenu=new LinearLayout(this);nativeMenu.setOrientation(LinearLayout.VERTICAL);nativeMenu.setBackgroundColor(0xEE111522);
        nativeTimeText=new TextView(this);nativeTimeText.setTextColor(Color.WHITE);nativeTimeText.setTextSize(12);nativeTimeText.setPadding(dp(14),dp(6),dp(14),0);nativeMenu.addView(nativeTimeText);
        nativeTimeBar=new DefaultTimeBar(this,null);nativeTimeBar.setId(View.generateViewId());nativeTimeBar.setContentDescription("Pozycja odtwarzania. Lewo i prawo: 10 sekund.");nativeTimeBar.setKeyTimeIncrement(10000);nativeTimeBar.setFocusable(true);nativeTimeBar.setFocusableInTouchMode(true);
        nativeTimeBar.setPlayedColor(0xFFBAA2FF);nativeTimeBar.setBufferedColor(0xFF68718A);nativeTimeBar.setUnplayedColor(0xFF333B50);nativeTimeBar.setScrubberColor(Color.WHITE);
        GradientDrawable timelineFocus=new GradientDrawable();timelineFocus.setColor(0x2239325A);timelineFocus.setCornerRadius(dp(6));timelineFocus.setStroke(dp(3),0xFFBAA2FF);StateListDrawable timelineBackground=new StateListDrawable();timelineBackground.addState(new int[]{android.R.attr.state_focused},timelineFocus);timelineBackground.addState(new int[]{},new GradientDrawable());nativeTimeBar.setBackground(timelineBackground);
        LinearLayout.LayoutParams timelineParams=new LinearLayout.LayoutParams(-1,dp(40));timelineParams.setMargins(dp(12),0,dp(12),dp(4));nativeMenu.addView(nativeTimeBar,timelineParams);
        nativeTimeBar.addListener(new TimeBar.OnScrubListener(){
            @Override public void onScrubStart(TimeBar bar,long position){scrubbing=true;showTimelineTime(position);}
            @Override public void onScrubMove(TimeBar bar,long position){showTimelineTime(position);}
            @Override public void onScrubStop(TimeBar bar,long position,boolean cancelled){scrubbing=false;if(!cancelled)seekToPosition(position);updateTimeline();}
        });
        HorizontalScrollView transportScroll=new HorizontalScrollView(this);transportScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout transport=new LinearLayout(this);transport.setOrientation(LinearLayout.HORIZONTAL);transport.setGravity(Gravity.CENTER_VERTICAL);transportScroll.addView(transport);nativeMenu.addView(transportScroll);
        action("◀ 10 sekund",transport,()->seekBy(-10000));
        nativePause=action("Pauza",transport,this::togglePause);
        nativePause.setId(View.generateViewId());nativePause.setNextFocusUpId(nativeTimeBar.getId());nativeTimeBar.setNextFocusDownId(nativePause.getId());
        action("10 sekund ▶",transport,()->seekBy(10000));
        nativeFullscreen=action("Pełny ekran",transport,()->setPlayerFullscreen(!playerFullscreen));
        action("Zapisz",transport,()->openWebPanel("save"));
        HorizontalScrollView scroller=new HorizontalScrollView(this);scroller.setHorizontalScrollBarEnabled(false);
        scroller.setBackgroundColor(0xCC111522);
        nativeActions=new LinearLayout(this);nativeActions.setOrientation(LinearLayout.HORIZONTAL);nativeActions.setGravity(Gravity.CENTER_VERTICAL);
        nativeActions.setPadding(dp(10),dp(4),dp(10),dp(4));scroller.addView(nativeActions,new HorizontalScrollView.LayoutParams(-2,-2));
        if(canPrevious)action("◀ Poprzedni",nativeActions,()->post(event("previous")));
        if(canNext)action("Następny ▶",nativeActions,()->post(event("next")));
        nativeSources=action("Zmień źródło",nativeActions,()->openWebPanel("sources"));
        if(series||canPrevious||canNext){
            nativeAutoplay=action("Autoplay: "+(autoAdvance?"WŁ.":"WYŁ."),nativeActions,()->{autoAdvance=!autoAdvance;postFlag("autoplay",autoAdvance);nativeAutoplay.setText("Autoplay: "+(autoAdvance?"WŁ.":"WYŁ."));});
            nativeHost=action("Ten hosting: "+(preferManualHost?"TAK":"NIE"),nativeActions,()->{preferManualHost=!preferManualHost;postFlag("hosting",preferManualHost);nativeHost.setText("Ten hosting: "+(preferManualHost?"TAK":"NIE"));});
        }
        action("Zamknij film",nativeActions,()->closePlayer(true,false));
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);params.bottomMargin=dp(8);
        nativeMenu.addView(scroller);playerLayer.addView(nativeMenu,params);
        nativeMenu.addOnLayoutChangeListener((v,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom)->{if(bottom-top!=oldBottom-oldTop)updatePlayerLayout();});
        nativeTitle.addOnLayoutChangeListener((v,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom)->{if(bottom-top!=oldBottom-oldTop)updatePlayerLayout();});
        scroller.setTag("nativeActionScroller");
    }

    private String playbackTime(long milliseconds){long seconds=Math.max(0,milliseconds/1000);return seconds>=3600?String.format(Locale.ROOT,"%d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60):String.format(Locale.ROOT,"%d:%02d",seconds/60,seconds%60);}
    private void showTimelineTime(long position){if(nativeTimeText!=null&&player!=null)nativeTimeText.setText(playbackTime(position)+" / "+(player.getDuration()>0?playbackTime(player.getDuration()):"—"));}
    private void updateTimeline(){if(player==null||nativeTimeBar==null)return;long duration=player.getDuration();nativeTimeBar.setDuration(Math.max(0,duration));nativeTimeBar.setBufferedPosition(player.getBufferedPosition());nativeTimeBar.setEnabled(duration>0&&player.isCurrentMediaItemSeekable());if(!scrubbing){nativeTimeBar.setPosition(player.getCurrentPosition());showTimelineTime(player.getCurrentPosition());}}
    private void updatePlayerLayout(){if(playerView==null||nativeMenu==null||nativeTitle==null)return;FrameLayout.LayoutParams layout=new FrameLayout.LayoutParams(-1,-1);if(!playerFullscreen){layout.topMargin=nativeTitle.getMeasuredHeight()>0?nativeTitle.getMeasuredHeight():dp(56);layout.bottomMargin=(nativeMenu.getMeasuredHeight()>0?nativeMenu.getMeasuredHeight():dp(164))+dp(8);}playerView.setLayoutParams(layout);}

    private void postFlag(String type,boolean enabled){JSONObject result=event(type);try{result.put("enabled",enabled);}catch(Exception ignored){}post(result);}
    private void refreshNativeControls(boolean focusPause){
        if(player==null||playerView==null||nativeMenu==null)return;
        boolean visible=PlaybackControls.showMenu(playerFullscreen,player.getPlayWhenReady());
        nativeTitle.setVisibility(visible?View.VISIBLE:View.GONE);nativeMenu.setVisibility(visible?View.VISIBLE:View.GONE);
        if(nativePause!=null)nativePause.setText(player.getPlayWhenReady()?"Pauza":"Wznów");
        if(nativeFullscreen!=null)nativeFullscreen.setText(playerFullscreen?"Wróć do menu":"Pełny ekran");
        updatePlayerLayout();updateTimeline();
        playerView.hideController();
        if(webPanel)return;
        if(visible&&focusPause&&nativePause!=null)nativePause.requestFocus();else if(!visible)playerView.requestFocus();
    }
    private void hideNativeControls(){refreshNativeControls(false);}
    private void showNativeControls(boolean focusPause){if(player==null)return;if(playerFullscreen&&player.getPlayWhenReady())player.pause();refreshNativeControls(focusPause);}
    private void togglePause(){if(player==null)return;if(player.getPlayWhenReady())player.pause();else player.play();refreshNativeControls(true);}
    private void seekBy(long offset){if(player!=null)seekToPosition(PlaybackControls.seekTarget(player.getCurrentPosition(),player.getDuration(),offset));}
    private void seekToPosition(long position){if(player==null)return;if(!player.isCurrentMediaItemSeekable()){Toast.makeText(this,"To źródło nie udostępnia przewijania.",Toast.LENGTH_SHORT).show();return;}player.seekTo(PlaybackControls.seekTarget(position,player.getDuration(),0));updateTimeline();sendProgress(false);}
    private void setPlayerFullscreen(boolean enabled){playerFullscreen=enabled;postFlag("fullscreen",enabled);refreshNativeControls(true);immersive();}
    private void setWebPanel(boolean open){if(playerLayer==null)return;webPanel=open;playerLayer.setVisibility(open?View.GONE:View.VISIBLE);if(open&&web!=null)web.requestFocus();else refreshNativeControls(true);}
    private void openWebPanel(String type){setWebPanel(true);post(event(type));}

    private boolean rejectShortVideo(){if(player==null)return false;long duration=player.getDuration();if(duration<=0||duration==C.TIME_UNSET||duration>=60000)return false;JSONObject result=event("error");try{result.put("message","Materiał krótszy niż 60 sekund — pomijam źródło.");}catch(Exception ignored){}post(result);closePlayer(false,false);return true;}

    private JSONObject event(String type){JSONObject value=new JSONObject();try{value.put("type",type);value.put("playbackId",playbackId);}catch(Exception ignored){}return value;}
    private void post(JSONObject value){if(playerReply!=null&&WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))try{playerReply.postMessage(value.toString());}catch(Exception ignored){}}
    private void sendProgress(boolean completed){if(player==null||player.getDuration()<60000)return;JSONObject value=event("progress");try{value.put("position",player.getCurrentPosition()/1000.0);value.put("duration",player.getDuration()/1000.0);value.put("playing",player.isPlaying());value.put("completed",completed);}catch(Exception ignored){}post(value);}
    private void closePlayer(boolean notify,boolean ended){if(player==null)return;sendProgress(ended);JSONObject closed=event("closed");try{closed.put("ended",ended);}catch(Exception ignored){}handler.removeCallbacks(progressTick);handler.removeCallbacks(timelineTick);handler.removeCallbacks(hideNativeOverlay);ExoPlayer old=player;player=null;if(playerView!=null)playerView.setPlayer(null);old.release();if(playerLayer!=null)root.removeView(playerLayer);playerLayer=null;playerView=null;nativeTitle=null;nativeActions=null;nativeAutoplay=null;nativeHost=null;nativeSources=null;nativePause=null;nativeFullscreen=null;nativeMenu=null;nativeTimeBar=null;nativeTimeText=null;scrubbing=false;webPanel=false;pausedByLifecycle=false;if(notify)post(closed);playerReply=null;playbackId=null;if(menuButton!=null)menuButton.setVisibility(View.VISIBLE);if(cursor!=null)cursor.setVisibility(cursorMode?View.VISIBLE:View.GONE);if(web!=null)web.requestFocus();immersive();}
    private void hideCustom(){if(customView==null)return;root.removeView(customView);customView=null;if(customCallback!=null)customCallback.onCustomViewHidden();customCallback=null;if(menuButton!=null)menuButton.setVisibility(View.VISIBLE);if(cursor!=null)cursor.setVisibility(cursorMode?View.VISIBLE:View.GONE);immersive();}

    private void editServer(){EditText input=new EditText(this);input.setSingleLine(true);input.setText(server);input.setHint("192.168.11.20:9999 lub https://twoje-kino.pl");input.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Adres serwera Cinema Hub").setMessage("Wpisz IP z portem lub pełny adres panelu kontenera.").setView(input).setPositiveButton("Połącz",null).setNeutralButton("Pi :9999",(d,w)->{server=ServerAddress.DEFAULT;saveServer();createWeb();}).setNegativeButton("Anuluj",null).create();dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{String address=ServerAddress.normalize(input.getText().toString());server=address;saveServer();dialog.dismiss();createWeb();}catch(IllegalArgumentException error){input.setError(error.getMessage());}}));dialog.show();}
    private void saveServer(){preferences.edit().putString("server",server).putBoolean("configured",true).apply();}
    private void menu(){String[] entries={"Wróć do panelu","Biblioteka","Odśwież","Adres IP / URL serwera",cursorMode?"Pilot: przełącz na wybór przycisków":"Pilot: włącz kursor","Pobrania Android","Sprawdź aktualizacje","Zamknij aplikację"};new AlertDialog.Builder(this).setTitle("Cinema Hub · "+server).setItems(entries,(d,index)->{if(index==1){closePlayer(true,false);if(web!=null)web.loadUrl(server);}if(index==2){if(web!=null)web.reload();else createWeb();}if(index==3)editServer();if(index==4){cursorMode=!cursorMode;preferences.edit().putBoolean("cursor",cursorMode).apply();cursor.setVisibility(cursorMode?View.VISIBLE:View.GONE);web.requestFocus();}if(index==5)try{startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS));}catch(Exception error){Toast.makeText(this,"Otwórz folder Download w menedżerze plików.",Toast.LENGTH_LONG).show();}if(index==6)checkForUpdates(true);if(index==7)finish();}).show();}
    private void showError(String message){if(errorView!=null)root.removeView(errorView);LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setGravity(Gravity.CENTER);panel.setPadding(dp(45),dp(30),dp(45),dp(30));panel.setBackgroundColor(Color.rgb(11,13,18));TextView title=new TextView(this);title.setText("Cinema Hub");title.setTextColor(Color.rgb(162,138,255));title.setTextSize(28);panel.addView(title);TextView description=new TextView(this);description.setText(message+"\n\n"+server);description.setTextColor(Color.WHITE);description.setTextSize(17);description.setPadding(0,dp(20),0,dp(20));panel.addView(description);Button retry=new Button(this);retry.setText("Ponów");retry.setOnClickListener(v->createWeb());panel.addView(retry);Button settings=new Button(this);settings.setText("Zmień adres serwera");settings.setOnClickListener(v->editServer());panel.addView(settings);root.addView(panel,new FrameLayout.LayoutParams(-1,-1));errorView=panel;retry.requestFocus();}

    private void download(String address,String agent,String disposition,String mime){if(!ServerAddress.isDownload(server,address)){Toast.makeText(this,"Można zapisać wyłącznie film ręcznie wybrany w Cinema Hub.",Toast.LENGTH_LONG).show();return;}if(Build.VERSION.SDK_INT<29&&checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED){pendingDownload=new String[]{address,agent,disposition,mime};requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},11);return;}try{String name=URLUtil.guessFileName(address,disposition,mime);if(disposition!=null){int at=disposition.toLowerCase(Locale.ROOT).indexOf("filename*=utf-8''");if(at>=0)name=URLDecoder.decode(disposition.substring(at+17).split(";")[0].replace("\"",""),"UTF-8");}name=name.replaceAll("[<>:\"/\\\\|?*\\p{Cntrl}]","_");int dot=name.lastIndexOf('.');String ext=dot>0?name.substring(dot):".mp4",label=dot>0?name.substring(0,dot):name;while(label.getBytes("UTF-8").length>180)label=label.substring(0,label.length()-1);String stamp=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new java.util.Date());name=label+" - "+stamp+ext;DownloadManager.Request request=new DownloadManager.Request(Uri.parse(address)).setTitle(name).setDescription("Ręczny zapis filmu z Cinema Hub").setMimeType(mime).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,name);String cookies=CookieManager.getInstance().getCookie(server);if(cookies!=null)request.addRequestHeader("Cookie",cookies);request.addRequestHeader("User-Agent",agent);((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);Toast.makeText(this,"Dodano do pobrań Android: "+name,Toast.LENGTH_LONG).show();}catch(Exception error){Toast.makeText(this,"Nie można rozpocząć zapisu na urządzeniu. Sprawdź wolne miejsce i systemową aplikację Pobrania.",Toast.LENGTH_LONG).show();}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==11&&pendingDownload!=null){String[] request=pendingDownload;pendingDownload=null;if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)download(request[0],request[1],request[2],request[3]);}}
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==10&&fileChooser!=null){fileChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileChooser=null;}}

    private void moveCursor(){if(web==null||cursor==null)return;cursorX=Math.max(2,Math.min(root.getWidth()-dp(22),cursorX));cursorY=Math.max(2,Math.min(root.getHeight()-dp(22),cursorY));cursor.setTranslationX(cursorX);cursor.setTranslationY(cursorY);}
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        int key=event.getKeyCode();boolean keyDown=event.getAction()==KeyEvent.ACTION_DOWN;
        if(player!=null&&!webPanel){
            if(key==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||key==KeyEvent.KEYCODE_HEADSETHOOK){if(keyDown&&event.getRepeatCount()==0)togglePause();return true;}
            if(key==KeyEvent.KEYCODE_MEDIA_PAUSE){if(keyDown)player.pause();return true;}
            if(key==KeyEvent.KEYCODE_MEDIA_PLAY){if(keyDown)player.play();return true;}
            if(key==KeyEvent.KEYCODE_MEDIA_REWIND||key==KeyEvent.KEYCODE_MEDIA_FAST_FORWARD){if(keyDown&&event.getRepeatCount()%5==0)seekBy(key==KeyEvent.KEYCODE_MEDIA_REWIND?-10000:10000);return true;}
            if(key==KeyEvent.KEYCODE_MENU||key==KeyEvent.KEYCODE_DPAD_UP&&playerView!=null&&playerView.hasFocus()){if(keyDown&&event.getRepeatCount()==0)showNativeControls(true);return true;}
            if((key==KeyEvent.KEYCODE_DPAD_CENTER||key==KeyEvent.KEYCODE_ENTER)&&playerView!=null&&playerView.isFocused()){if(keyDown&&event.getRepeatCount()==0)togglePause();return true;}
            if((key==KeyEvent.KEYCODE_DPAD_LEFT||key==KeyEvent.KEYCODE_DPAD_RIGHT)&&(playerFullscreen||playerView!=null&&playerView.isFocused())&&player.getPlayWhenReady()){if(keyDown&&event.getRepeatCount()%5==0)seekBy(key==KeyEvent.KEYCODE_DPAD_LEFT?-10000:10000);return true;}
            if(playerView!=null&&playerView.hasFocus()&&key!=KeyEvent.KEYCODE_BACK&&playerView.dispatchKeyEvent(event))return true;
        }
        if(key==KeyEvent.KEYCODE_MENU&&player==null){if(event.getAction()==KeyEvent.ACTION_UP)menu();return true;}
        String remoteKey=RemoteNavigation.key(key);
        if(remoteKey!=null&&!cursorMode&&web!=null&&web.hasFocus()&&loginDialog==null&&customView==null&&(player==null||webPanel)){
            if(keyDown&&RemoteNavigation.repeatAllowed(remoteKey,event.getRepeatCount())){
                final WebView target=web;
                final KeyEvent original=new KeyEvent(event),released=KeyEvent.changeAction(original,KeyEvent.ACTION_UP);
                target.evaluateJavascript("!!(window.CinemaHubTV&&typeof window.CinemaHubTV.key==='function'&&window.CinemaHubTV.key("+JSONObject.quote(remoteKey)+"))",result->{
                    if(target==web&&!"true".equals(result)){target.dispatchKeyEvent(original);target.dispatchKeyEvent(released);}
                });
            }
            return true;
        }
        if(cursorMode&&web!=null&&web.hasFocus()&&loginDialog==null&&customView==null&&player==null){if(key>=KeyEvent.KEYCODE_DPAD_UP&&key<=KeyEvent.KEYCODE_DPAD_RIGHT){if(event.getAction()==KeyEvent.ACTION_DOWN){float step=dp(9)*Math.min(4,1+event.getRepeatCount()/8f);if(key==KeyEvent.KEYCODE_DPAD_UP)cursorY-=step;if(key==KeyEvent.KEYCODE_DPAD_DOWN)cursorY+=step;if(key==KeyEvent.KEYCODE_DPAD_LEFT)cursorX-=step;if(key==KeyEvent.KEYCODE_DPAD_RIGHT)cursorX+=step;moveCursor();}return true;}if(key==KeyEvent.KEYCODE_DPAD_CENTER||key==KeyEvent.KEYCODE_ENTER){if(event.getAction()==KeyEvent.ACTION_UP){long time=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(time,time,MotionEvent.ACTION_DOWN,cursorX+dp(8),cursorY+dp(8),0),up=MotionEvent.obtain(time,time+40,MotionEvent.ACTION_UP,cursorX+dp(8),cursorY+dp(8),0);web.dispatchTouchEvent(down);web.dispatchTouchEvent(up);down.recycle();up.recycle();}return true;}if(key==KeyEvent.KEYCODE_PAGE_DOWN||key==KeyEvent.KEYCODE_PAGE_UP){if(event.getAction()==KeyEvent.ACTION_DOWN)web.scrollBy(0,(key==KeyEvent.KEYCODE_PAGE_DOWN?1:-1)*root.getHeight()/2);return true;}}return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed(){if(player!=null){if(webPanel&&web!=null){web.evaluateJavascript("!!(window.CinemaHubTV&&window.CinemaHubTV.back())",result->{if(!"true".equals(result))setWebPanel(false);});}else if(playerFullscreen)setPlayerFullscreen(false);else closePlayer(true,false);return;}if(customView!=null){hideCustom();return;}if(loginDialog!=null){if(loginWeb!=null&&loginWeb.canGoBack())loginWeb.goBack();else loginDialog.dismiss();return;}if(web==null){finish();return;}web.evaluateJavascript("!!(window.CinemaHubTV&&window.CinemaHubTV.back())",result->{if(!"true".equals(result)){if(web.canGoBack())web.goBack();else new AlertDialog.Builder(this).setMessage("Zamknąć Cinema Hub?").setPositiveButton("Zamknij",(d,w)->finish()).setNegativeButton("Wróć",null).show();}});}
    @Override protected void onPause(){super.onPause();CookieManager.getInstance().flush();if(player!=null){pausedByLifecycle=player.isPlaying();player.pause();sendProgress(false);}if(web!=null)web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(player!=null&&pausedByLifecycle){pausedByLifecycle=false;player.play();}if(waitingForInstallPermission){waitingForInstallPermission=false;if(Build.VERSION.SDK_INT>=26&&getPackageManager().canRequestPackageInstalls())requestUpdateInstall();else Toast.makeText(this,"Instalacja aktualizacji wymaga zezwolenia „Zezwalaj z tego źródła”.",Toast.LENGTH_LONG).show();}immersive();}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);updateExecutor.shutdownNow();closePlayer(false,false);hideCustom();if(fileChooser!=null)fileChooser.onReceiveValue(null);if(loginDialog!=null)loginDialog.dismiss();if(updateProgressDialog!=null)updateProgressDialog.dismiss();if(web!=null)web.destroy();super.onDestroy();}
}
