"""Ask the login browser's X11 windows to close and save their profile."""

import ctypes as c
import sys


class ClientMessage(c.Structure):
    _fields_ = [
        ('type', c.c_int), ('serial', c.c_ulong), ('send_event', c.c_int),
        ('display', c.c_void_p), ('window', c.c_ulong), ('message_type', c.c_ulong),
        ('format', c.c_int), ('data', c.c_long * 5),
    ]


class XEvent(c.Union):
    _fields_ = [('message', ClientMessage), ('padding', c.c_long * 24)]


def close_windows(pid):
    x11 = c.CDLL('libX11.so.6')
    window = c.c_ulong
    atom = c.c_ulong
    display_pointer = c.c_void_p
    window_pointer = c.POINTER(window)
    bytes_pointer = c.POINTER(c.c_ubyte)
    x11.XOpenDisplay.argtypes = [c.c_char_p]
    x11.XOpenDisplay.restype = display_pointer
    x11.XDefaultRootWindow.argtypes = [display_pointer]
    x11.XDefaultRootWindow.restype = window
    x11.XInternAtom.argtypes = [display_pointer, c.c_char_p, c.c_int]
    x11.XInternAtom.restype = atom
    x11.XQueryTree.argtypes = [display_pointer, window, c.POINTER(window), c.POINTER(window), c.POINTER(window_pointer), c.POINTER(c.c_uint)]
    x11.XGetWindowProperty.argtypes = [display_pointer, window, atom, c.c_long, c.c_long, c.c_int, atom, c.POINTER(atom), c.POINTER(c.c_int), c.POINTER(c.c_ulong), c.POINTER(c.c_ulong), c.POINTER(bytes_pointer)]
    x11.XGetWMProtocols.argtypes = [display_pointer, window, c.POINTER(c.POINTER(atom)), c.POINTER(c.c_int)]
    x11.XSendEvent.argtypes = [display_pointer, window, c.c_int, c.c_long, c.POINTER(XEvent)]
    x11.XFree.argtypes = [c.c_void_p]
    x11.XCloseDisplay.argtypes = [display_pointer]

    display = x11.XOpenDisplay(None)
    if not display:
        return False
    root, parent, children, child_count = window(), window(), window_pointer(), c.c_uint()
    sent = False
    try:
        if not x11.XQueryTree(display, x11.XDefaultRootWindow(display), c.byref(root), c.byref(parent), c.byref(children), c.byref(child_count)):
            return False
        pid_property = x11.XInternAtom(display, b'_NET_WM_PID', True)
        cardinal = x11.XInternAtom(display, b'CARDINAL', True)
        wm_protocols = x11.XInternAtom(display, b'WM_PROTOCOLS', True)
        wm_delete = x11.XInternAtom(display, b'WM_DELETE_WINDOW', True)
        if not all((pid_property, cardinal, wm_protocols, wm_delete)):
            return False

        for target in children[:child_count.value]:
            actual_type, actual_format = atom(), c.c_int()
            count, remaining, value = c.c_ulong(), c.c_ulong(), bytes_pointer()
            status = x11.XGetWindowProperty(display, target, pid_property, 0, 1, False, cardinal, c.byref(actual_type), c.byref(actual_format), c.byref(count), c.byref(remaining), c.byref(value))
            try:
                if status or not value or count.value != 1 or actual_format.value != 32 or c.cast(value, c.POINTER(c.c_ulong))[0] != pid:
                    continue
            finally:
                if value:
                    x11.XFree(value)

            protocols, protocol_count = c.POINTER(atom)(), c.c_int()
            if not x11.XGetWMProtocols(display, target, c.byref(protocols), c.byref(protocol_count)):
                continue
            try:
                if wm_delete not in protocols[:protocol_count.value]:
                    continue
            finally:
                x11.XFree(protocols)

            event = XEvent()
            event.message = ClientMessage(33, 0, True, display, target, wm_protocols, 32, (c.c_long * 5)(wm_delete))
            sent = bool(x11.XSendEvent(display, target, False, 0, c.byref(event))) or sent
        return sent
    finally:
        if children:
            x11.XFree(children)
        x11.XCloseDisplay(display)


if __name__ == '__main__':
    sys.exit(0 if close_windows(int(sys.argv[1])) else 1)
