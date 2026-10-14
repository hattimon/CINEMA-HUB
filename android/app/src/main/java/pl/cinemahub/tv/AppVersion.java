package pl.cinemahub.tv;

final class AppVersion {
    private AppVersion() {}

    static boolean isNewer(String candidate, String installed) {
        String[] next = parts(candidate);
        String[] current = parts(installed);
        for (int index = 0; index < next.length; index++) {
            int comparison = Integer.compare(Integer.parseInt(next[index]), Integer.parseInt(current[index]));
            if (comparison != 0) return comparison > 0;
        }
        return false;
    }

    private static String[] parts(String version) {
        if (version == null) throw new IllegalArgumentException("Missing version");
        String[] parts = version.split("\\.", -1);
        if (parts.length != 3) throw new IllegalArgumentException("Expected a three-part version");
        for (String part : parts) if (!part.matches("[0-9]{1,9}")) throw new IllegalArgumentException("Invalid version");
        return parts;
    }
}
