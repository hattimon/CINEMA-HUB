package pl.cinemahub.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

/** Passive scanline/phosphor overlay. Draws only when its size or style changes. */
final class CrtOverlay extends View {
    private final Paint paint=new Paint();
    private String effect="none";
    private Shader vignette;
    CrtOverlay(Context context){super(context);setFocusable(false);setClickable(false);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);setVisibility(GONE);}
    void setEffect(String value){if(effect.equals(value))return;effect=value;setVisibility("none".equals(value)?GONE:VISIBLE);invalidate();}
    @Override protected void onSizeChanged(int w,int h,int oldW,int oldH){if(w>0&&h>0)vignette=new RadialGradient(w/2f,h/2f,Math.max(w,h)*.58f,new int[]{Color.TRANSPARENT,Color.TRANSPARENT,0x90000000},new float[]{0f,.55f,1f},Shader.TileMode.CLAMP);}
    @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);if("none".equals(effect))return;
        paint.setShader(null);paint.setColor("crt-warm".equals(effect)?0x13FF9A35:"crt-green".equals(effect)?0x2000D86B:0x0600C8FF);canvas.drawRect(0,0,getWidth(),getHeight(),paint);
        paint.setColor(0x38000000);for(int y=0;y<getHeight();y+=3)canvas.drawRect(0,y,getWidth(),y+1,paint);
        for(int x=0;x<getWidth();x+=3){paint.setColor(0x09FF0000);canvas.drawRect(x,0,x+1,getHeight(),paint);paint.setColor(0x0900FF00);canvas.drawRect(x+1,0,x+2,getHeight(),paint);paint.setColor(0x090000FF);canvas.drawRect(x+2,0,x+3,getHeight(),paint);}
        paint.setColor(Color.WHITE);paint.setShader(vignette);canvas.drawRect(0,0,getWidth(),getHeight(),paint);paint.setShader(null);
    }
}
