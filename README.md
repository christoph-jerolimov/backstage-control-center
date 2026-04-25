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

## Window rearrange buttons

The **Tile Left** and **Tile Right** buttons rearrange the currently focused
window. Wayland compositors do not expose external window-control CLIs in a
portable way (e.g. GNOME/Mutter has no `swaymsg`/`hyprctl` equivalent and the
GNOME Shell `Eval` D-Bus method has been locked down since GNOME 41), so the
backend instead simulates the compositor's built-in tiling shortcuts via
[`ydotool`](https://github.com/ReimuNotMoe/ydotool):

| Button     | Keystroke sent  | Command                                |
| ---------- | --------------- | -------------------------------------- |
| Tile Left  | `Super` + `←`   | `ydotool key 125:1 105:1 105:0 125:0`  |
| Tile Right | `Super` + `→`   | `ydotool key 125:1 106:1 106:0 125:0`  |

The keycodes (`125`, `105`, `106`) are `KEY_LEFTMETA`, `KEY_LEFT`, `KEY_RIGHT`
from `linux/input-event-codes.h`. The host was tested on GNOME / Wayland,
where `Super+Left` and `Super+Right` are bound to half-screen tiling out of
the box; on other compositors that honour the same shortcut (KDE, most
wlroots-based ones with default keymaps) it should work without changes.

### Operational requirement

`ydotool` writes synthetic input events through `/dev/uinput`, which bypasses
Wayland's input-isolation rules but requires:

- the `ydotool` and `ydotoold` packages installed on the host,
- the `ydotoold` daemon running (e.g. `systemctl --user start ydotoold`),
- the user running the backend to have access to `/dev/uinput` (typically by
  being in the `input` group) and to the ydotool socket — set
  `YDOTOOL_SOCKET` if the daemon's socket is in a non-default location.

The backend runs `ydotool --help` once at startup and logs a warning if any
of the above is missing, so the failure mode is visible in the logs rather
than only at button-press time.

Only Linux/Wayland is supported.

## Slack status buttons

The five **Status: …** buttons set the user's Slack status by calling Slack's
`users.profile.set` Web API from the backend:

| Button           | `status_text`         | `status_emoji`             |
| ---------------- | --------------------- | -------------------------- |
| Status: Online   | _(cleared)_           | _(cleared)_                |
| Status: Afk      | `Away from keyboard`  | `:walking:`                |
| Status: Focus    | `Focusing`            | `:headphones:`             |
| Status: Lunch    | `Out for lunch`       | `:burrito:`                |
| Status: Meeting  | `In a meeting`        | `:spiral_calendar_pad:`    |

Focus mode additionally enables Do Not Disturb for 60 minutes via
`dnd.setSnooze`; switching back to **Online** ends the snooze.

### Operational requirement

You need a Slack **user** OAuth token (the one starting with `xoxp-`) with at
least the `users.profile:write` scope, plus `dnd:write` if you want Focus
mode to also toggle Do Not Disturb. Bot tokens (`xoxb-`) cannot change a
user's profile and will not work.

Configure the token in `app-config.yaml` (or, more typically, via an env
var):

```yaml
slack:
  userToken: ${SLACK_USER_TOKEN}
```

The backend calls `auth.test` once at startup and logs a warning if the
token is missing or rejected, so the failure mode is visible in the logs
rather than only at button-press time.
