import TrackPlayer from "react-native-track-player";
import "expo-router/entry";

// TrackPlayer expects a function (not a module object) for the service.
TrackPlayer.registerPlaybackService(
  () => require("./trackPlayerService").default
);
