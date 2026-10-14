package pl.cinemahub.tv;

public final class AppVersionTest {
    public static void main(String[] args) {
        require(AppVersion.isNewer("1.3.3", "1.3.2"));
        require(AppVersion.isNewer("1.3.10", "1.3.9"));
        require(AppVersion.isNewer("1.4.0", "1.3.99"));
        require(!AppVersion.isNewer("1.3.2", "1.3.2"));
        require(!AppVersion.isNewer("1.3.1", "1.3.2"));
        System.out.println("Android update version checks passed");
    }

    private static void require(boolean value) {
        if (!value) throw new AssertionError("Unexpected version comparison result");
    }
}
