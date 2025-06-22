# Installation
Place `m3u8ex.js` into the script directory of mpv

# Syntax
This script piggybacks off of the existing `.m3u` or `.m3u8` extension so that shell integration may remain unchanged. `#EXTM3U_EX` is to be used to demarcate a file for processing.

Each "playlist" supports a *single* group of files to be played at once. Any regular playlist file of choice can include these.

All audio tracks with the `forced` flag set (either through embedded track metadata or through the example below) will automatically be merged to play all tracks simultaneously.

## Example
If no primary audio/video track is provided, the first track's name (Keyboard) is stripped away by mpv (if this is unacceptable, duplicate one of the tracks without setting the FORCED flag)
```
#EXTM3U_EX

#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,NAME="Keyboard",URI="C:\\mydir\\keyboard.ogg"
#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,NAME="Drums",URI="./tracks/drums.ogg"
#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,NAME="Vocals",URI="./tracks/vocals.ogg"
```

Providing a audio/video track at the end is optional, embedded streams within the track are selectable by track number (0-indexed) or by track title
```
#EXTM3U_EX

#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,TRACK-NUM=123
#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,TRACK-NUM=all
#EXT-X-MEDIA:TYPE=AUDIO,FORCED=YES,TRACK="BGM"
#EXT-X-MEDIA:TYPE=SUBTITLES,FORCED=YES,NAME="Karaoke",URI="./tracks/lyrics.ass"
mv.mp4
```