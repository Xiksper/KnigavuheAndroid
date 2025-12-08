import TrackPlayer, { Event } from "react-native-track-player";

const TrackPlayerService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext().catch(() => {})
  );
  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious().catch(() => TrackPlayer.seekTo(0))
  );
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) =>
    TrackPlayer.seekTo(event.position)
  );
  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    if (event.ducking) {
      TrackPlayer.setVolume(0.2);
    } else {
      TrackPlayer.setVolume(1);
    }
  });
};

export default TrackPlayerService;
