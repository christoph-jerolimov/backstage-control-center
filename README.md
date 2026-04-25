# WIP and just for fun local Control Center based on Backstage

![Screenshot](screenshot.png?raw=true)

## Audio control buttons

The volume, mute, mic, and play/pause buttons in the control grid call the
`control-center` backend, which shells out to `pactl` and `playerctl` on the
host:

| Button        | Command                                              |
| ------------- | ---------------------------------------------------- |
| Volume Up     | `pactl set-sink-volume @DEFAULT_SINK@ +5%`           |
| Volume Down   | `pactl set-sink-volume @DEFAULT_SINK@ -5%`           |
| Volume Mute   | `pactl set-sink-mute @DEFAULT_SINK@ toggle`          |
| Mic On        | `pactl set-source-mute @DEFAULT_SOURCE@ 0`           |
| Mic Off       | `pactl set-source-mute @DEFAULT_SOURCE@ 1`           |
| Play / Pause  | `playerctl play` / `playerctl pause`                 |

Only Linux is supported. `pactl` works against both PulseAudio and PipeWire's
`pipewire-pulse` shim, so it works on every modern Wayland desktop without
extra configuration.

### Operational requirement

The backend Node process needs access to the user's session bus to talk to
PipeWire/PulseAudio. In practice this means launching the backend from inside
the desktop session so that `DBUS_SESSION_BUS_ADDRESS` and `XDG_RUNTIME_DIR`
are inherited — e.g. just running `yarn start` from a terminal in the Wayland
session, or wrapping the backend in a `systemctl --user` unit.

If the backend is started as a system service, from a fresh `ssh` session, or
under a different user, `pactl` will fail with `Connection refused` and the
audio buttons will return errors. To make the failure mode obvious, the
backend runs `pactl info` once at startup and logs a warning if it cannot
reach the session bus.

`playerctl` (used for Play / Pause) additionally needs an active MPRIS-capable
media player on the same session — Spotify, most browsers, `mpv`, etc.
