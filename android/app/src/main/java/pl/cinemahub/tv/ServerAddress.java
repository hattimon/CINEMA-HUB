package pl.cinemahub.tv;

import java.net.URI;
import java.util.Locale;

public final class ServerAddress {
    public static final String DEFAULT = "http://192.168.11.20:9999/";
    private ServerAddress() {}
    public static String normalize(String input) {
        try {
            String value=input.trim(); if(!value.contains("://"))value="http://"+value;
            URI uri=new URI(value); String scheme=uri.getScheme().toLowerCase(Locale.ROOT),host=uri.getHost();
            if(!scheme.equals("http")&&!scheme.equals("https")||host==null||host.isEmpty()||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||uri.getPort()==0||uri.getPort()>65535||!uri.getPath().isEmpty()&&!uri.getPath().equals("/"))throw new IllegalArgumentException();
            return new URI(scheme,null,host.toLowerCase(Locale.ROOT),uri.getPort(),"/",null,null).toASCIIString();
        } catch(Exception error) {throw new IllegalArgumentException("Wpisz IP z portem albo adres HTTP/HTTPS panelu, np. 192.168.11.20:9999.");}
    }
    private static int port(URI uri) {return uri.getPort()>=0?uri.getPort():"https".equalsIgnoreCase(uri.getScheme())?443:80;}
    public static boolean owns(String server,String address) {
        try {URI a=new URI(server),b=new URI(address);return b.getRawUserInfo()==null&&a.getScheme().equalsIgnoreCase(b.getScheme())&&a.getHost().equalsIgnoreCase(b.getHost())&&port(a)==port(b);}catch(Exception error){return false;}
    }
    public static String origin(String server) {return server.substring(0,server.length()-1);}
    public static boolean isDownload(String server,String address) {
        try {URI uri=new URI(address);return owns(server,address)&&uri.getRawQuery()==null&&uri.getRawFragment()==null&&uri.getRawPath().matches("/api/downloads/[a-f0-9]{32}/file");}catch(Exception error){return false;}
    }
    public static boolean isPlaybackId(String id) {return id!=null&&id.matches("[a-f0-9]{32}");}
}
