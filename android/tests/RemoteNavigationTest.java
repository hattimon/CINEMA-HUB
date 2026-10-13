package pl.cinemahub.tv;
public final class RemoteNavigationTest {
    private static int checks;
    private static void expect(boolean value){checks++;if(!value)throw new AssertionError("Check "+checks);}
    public static void main(String[] args){
        expect("ArrowUp".equals(RemoteNavigation.key(19)));
        expect("ArrowDown".equals(RemoteNavigation.key(20)));
        expect("ArrowLeft".equals(RemoteNavigation.key(21)));
        expect("ArrowRight".equals(RemoteNavigation.key(22)));
        expect("Enter".equals(RemoteNavigation.key(23)));
        expect("Enter".equals(RemoteNavigation.key(66)));
        expect("Enter".equals(RemoteNavigation.key(160)));
        expect(RemoteNavigation.key(4)==null);
        expect(RemoteNavigation.key(82)==null);
        expect(RemoteNavigation.repeatAllowed("Enter",0));
        expect(!RemoteNavigation.repeatAllowed("Enter",1));
        expect(RemoteNavigation.repeatAllowed("ArrowDown",2));
        System.out.println("PASS: "+checks+" D-pad and OK navigation checks");
    }
}
