import {
  nowInSec,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayStreamFactory,
  uuidV4,
  SkyWayChannel,
} from "@skyway-sdk/core";
import { SfuBotPlugin } from "@skyway-sdk/sfu-bot";
import { BlurBackground, VirtualBackground } from "skyway-video-processors";

const appId = "";
const secret = "";

const token = new SkyWayAuthToken({
  jti: uuidV4(),
  iat: nowInSec(),
  exp: nowInSec() + 60 * 60 * 24,
  scope: {
    app: {
      id: appId,
      turn: true,
      analytics: true,
      actions: ["read"],
      channels: [
        {
          id: "*",
          name: "*",
          actions: ["write"],
          members: [
            {
              id: "*",
              name: "*",
              actions: ["write"],
              publication: {
                actions: ["write"],
              },
              subscription: {
                actions: ["write"],
              },
            },
          ],

          sfuBots: [
            {
              actions: ["write"],
              forwardings: [
                {
                  actions: ["write"],
                },
              ],
            },
          ],
        },
      ],
    },
  },
}).encode(secret);

// Video and audio
(async () => {
  // 1
  const localVideo = document.getElementById("local-video");
  const buttonArea = document.getElementById("button-area");
  const remoteMediaArea = document.getElementById("remote-media-area");
  const channelNameInput = document.getElementById("channel-name");

  const myId = document.getElementById("my-id");
  const joinButton = document.getElementById("join");
  const muteButton = document.getElementById("mute");
  const shareScreenButton = document.getElementById("shareScreen");
  const leaveButton = document.getElementById("leave");

  const audioSelect = document.getElementById("audioSource");
  const videoSelect = document.getElementById("videoSource");

  const inputAudioDevices =
    await SkyWayStreamFactory.enumerateInputAudioDevices();
  let audio = await SkyWayStreamFactory.createMicrophoneAudioStream({
    deviceId: inputAudioDevices[0].id,
  });

  // stream2向け
  let audioB = await SkyWayStreamFactory.createMicrophoneAudioStream({
    deviceId: inputAudioDevices[0].id,
  });

  const cameraVideoStreamDefaultHeight = 240;
  const cameraVideoStreamDefaultWidth = 320;
  const cameraVideoStreamDefaultFrameRate = 15;

  const backgroundProcessor = new BlurBackground();

  await backgroundProcessor.initialize();

  const inputVideoDevices =
    await SkyWayStreamFactory.enumerateInputVideoDevices();
  let video = await SkyWayStreamFactory.createCustomVideoStream(
    backgroundProcessor,
    {
      deviceId: inputVideoDevices[0].id,
      height: cameraVideoStreamDefaultHeight,
      width: cameraVideoStreamDefaultWidth,
      frameRate: cameraVideoStreamDefaultFrameRate,
      stopTrackWhenDisabled: true,
    }
  );

  let videoB = await SkyWayStreamFactory.createCustomVideoStream(
    backgroundProcessor,
    {
      deviceId: inputVideoDevices[0].id,
      height: cameraVideoStreamDefaultHeight,
      width: cameraVideoStreamDefaultWidth,
      frameRate: cameraVideoStreamDefaultFrameRate,
      stopTrackWhenDisabled: true,
    }
  );

  let audioPublication;
  let videoPublication;
  // stream2向け
  let audioPublicationB;
  let videoPublicationB;

  // Change audio input source
  audioSelect.addEventListener("change", async function () {
    let selectedValue = this.value;

    try {
      audio = await SkyWayStreamFactory.createMicrophoneAudioStream({
        deviceId: selectedValue,
      });
    } catch (error) {
      console.error(
        "Error occurred while creating microphone audio stream:",
        error
      );
    }
  });

  // Change video input source
  videoSelect.addEventListener("change", async function () {
    let selectedValue = this.value;

    try {
      video = await SkyWayStreamFactory.createCustomVideoStream(
        backgroundProcessor,
        {
          deviceId: selectedValue,
          height: cameraVideoStreamDefaultHeight,
          width: cameraVideoStreamDefaultWidth,
          frameRate: cameraVideoStreamDefaultFrameRate,
          stopTrackWhenDisabled: true,
        }
      );
    } catch (error) {
      console.error("Error occurred while creating video stream:", error);
    }
  });

  await SkyWayStreamFactory.enumerateDevices()
    .then(function (deviceInfos) {
      for (var i = 0; i !== deviceInfos.length; ++i) {
        let deviceInfo = deviceInfos[i];
        let option = document.createElement("option");
        option.value = deviceInfo.id;
        option.text = deviceInfo.label;
        if (deviceInfo.kind === "audioinput") {
          audioSelect.appendChild(option);
        } else if (deviceInfo.kind === "videoinput") {
          videoSelect.appendChild(option);
        }
      }
    })
    .catch(function (error) {
      console.error("mediaDevices.enumerateDevices() error:", error);

      return;
    });

  video.attach(localVideo); // 3
  await localVideo.play(); // 4

  // screen sharing
  shareScreenButton.onclick = async () => {
    try {
      // Do nothing before publishing
      if (typeof audioPublication === "undefined") return;

      const newStream = await SkyWayStreamFactory.createDisplayStreams();

      await videoPublication.replaceStream(newStream.video, {
        releaseOldStream: false,
      });
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  };

  // Mute/Unmute audio device
  muteButton.onclick = async () => {
    // Do nothing before publishing
    if (typeof audioPublication === "undefined") return;

    try {
      // Mute state
      let state = audioPublication.state;

      if (state === "enabled") {
        // Mute
        await audioPublication.disable();
        muteButton.innerText = "unmute";
      } else if (state === "disabled") {
        // Unmute
        await audioPublication.enable();
        muteButton.innerText = "mute";
      } else {
        return;
      }
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  };

  // Create the channel
  joinButton.onclick = async () => {
    if (channelNameInput.value === "") return;

    try {
      const context = await SkyWayContext.Create(token, {
        log: {
          level: "debug",
        },
      });

      // stream2向け
      const contextB = await SkyWayContext.Create(token, {
        log: {
          level: "debug",
        },
      });

      const sfuBotPlugin = new SfuBotPlugin();

      context.registerPlugin(sfuBotPlugin);
      
      // stream2向け
      contextB.registerPlugin(sfuBotPlugin);

      // Search channel or create
      const channel = await SkyWayChannel.FindOrCreate(context, {
        name: channelNameInput.value,
      });

      // stream2向け
      const channelB = await SkyWayChannel.FindOrCreate(contextB, {
        name: channelNameInput.value,
      }); 

      const bot = await sfuBotPlugin.createBot(channel);
      // stream2向け
      const botB = await sfuBotPlugin.createBot(channelB);
      
      const maxSubscribers = 99;

      // Save the member
      const me = await channel.join();
      // stream2向け
      const meB = await channelB.join();
      myId.textContent = me.id;

      // Publish audio
      audioPublication = await me.publish(audio, {
        isEnabled: false,
      });

      // stream2向け
      audioPublicationB = await meB.publish(audioB, {
        isEnabled: false,
      });

      const videoEncodingsA = [
        {
          maxBitrate: 1_000_000,
          scaleResolutionDownBy: 1.5,

          id: "low",
        },
        {
          maxBitrate: 3_000_000,
          scaleResolutionDownBy: 1,
          id: "high",
        },
      ];

      // 配列の中を1つにするとsubscribe可能となる
      const videoEncodingsB = [
        {
          maxBitrate: 1_000_000,
          scaleResolutionDownBy: 1.5,

          id: "low",
        },
        {
          maxBitrate: 3_000_000,
          scaleResolutionDownBy: 1,
          id: "high",
        },
      ];

      // Publish video
      videoPublication = await me.publish(video, {
        encodings: videoEncodingsA,
      });

      // stream2向け
      videoPublicationB = await meB.publish(videoB, {
        encodings: videoEncodingsB,
      });

      await bot.startForwarding(audioPublication, {
        maxSubscribers: maxSubscribers,
      });

      // stream2向け
      await botB.startForwarding(audioPublicationB, {
        maxSubscribers: maxSubscribers,
      });

      await bot.startForwarding(videoPublication, {
        maxSubscribers: maxSubscribers,
      });

      // stream2向け
      await botB.startForwarding(videoPublicationB, {
        maxSubscribers: maxSubscribers,
      });

      const subscribeAndAttach = (publication) => {
        console.log(`publisher subtype: ${publication.publisher.subtype}`);
        // 3
        if (
          publication.publisher.subtype != "sfu" ||
          publication.origin.publisher.id === me.id ||
          publication.origin.publisher.id === meB.id
        )
          return;

        const subscribeButton = document.createElement("button"); // 3-1
        subscribeButton.textContent = `${publication.publisher.id}: ${publication.contentType} ${publication.origin?.id}`;

        buttonArea.appendChild(subscribeButton);

        subscribeButton.onclick = async () => {
          // 3-2
          const { stream } = await me.subscribe(publication, {
            preferredEncodingId: "high",
          });

          let newMedia; // 3-2-2
          switch (stream.track.kind) {
            case "video":
              newMedia = document.createElement("video");
              newMedia.playsInline = true;
              newMedia.autoplay = true;
              newMedia.id = stream.id;
              newMedia.onclick = switchEncodingSetting;
              break;
            case "audio":
              newMedia = document.createElement("audio");
              newMedia.controls = true;
              newMedia.autoplay = true;
              break;
            default:
              return;
          }
          stream.attach(newMedia); // 3-2-3
          remoteMediaArea.appendChild(newMedia);
        };
      };

      // Switch the encoding setting if you click the video
      const switchEncodingSetting = async (e) => {
        const videoId = e.srcElement.id;
        const subscription = me.subscriptions.find(
          (subscription) => subscription.stream.id == videoId
        );

        if (subscription.preferredEncoding === "high") {
          subscription.changePreferredEncoding("low");
        } else if (subscription.preferredEncoding === "low") {
          subscription.changePreferredEncoding("high");
        }
      };

      leaveButton.onclick = async () => {
        await me.leave();
        await channel.dispose();
      };

      channel.publications.forEach(subscribeAndAttach); // 1
      channel.onStreamPublished.add((e) => subscribeAndAttach(e.publication));
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  };
})(); // 1
