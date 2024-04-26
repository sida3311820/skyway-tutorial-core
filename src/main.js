import { nowInSec, SkyWayAuthToken, SkyWayContext, SkyWayStreamFactory, uuidV4, SkyWayChannel } from '@skyway-sdk/core';
import { SfuBotPlugin } from '@skyway-sdk/sfu-bot';

const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: nowInSec(),
    exp: nowInSec() + 60 * 60 * 24,
    scope: {
        app: {
            id: '244804f8-cdc4-484e-a8f9-6fbf99227b01',
            turn: true,
            analytics: true,
            actions: ['read'],
            channels: [
                {
                    id: '*',
                    name: '*',
                    actions: ['write'],
                    members: [
                        {
                            id: '*',
                            name: '*',
                            actions: ['write'],
                            publication: {
                                actions: ['write'],
                            },
                            subscription: {
                                actions: ['write'],
                            },
                        },
                    ],
                    sfuBots: [
                        {
                            actions: ['write'],
                            forwardings: [
                                {
                                    actions: ['write'],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
}).encode('joicwMieFh0hxq+8EoNZCNoH5x4qIXS3zYm9lG2zDcA=');


// Video and audio
(async () => {
    // 1
    const localVideo = document.getElementById('local-video');
    const buttonArea = document.getElementById('button-area');
    const remoteMediaArea = document.getElementById('remote-media-area');
    const channelNameInput = document.getElementById('channel-name');

    const myId = document.getElementById('my-id');
    const joinButton = document.getElementById('join');
    const muteButton = document.getElementById('mute');
    const shareScreenButton = document.getElementById('shareScreen')

    const audioSelect = document.getElementById('audioSource');
    const videoSelect = document.getElementById('videoSource');

    const inputAudioDevices = await SkyWayStreamFactory.enumerateInputAudioDevices();
    let audio = await SkyWayStreamFactory.createMicrophoneAudioStream({ deviceId: inputAudioDevices[0].id });

    const cameraVideoStreamDefaultHeight = 640;
    const cameraVideoStreamDefaultWidth = 360;
    const cameraVideoStreamDefaultFrameRate = 15;


    const inputVideoDevices = await SkyWayStreamFactory.enumerateInputVideoDevices();
    let video = await SkyWayStreamFactory.createCameraVideoStream({
        deviceId: inputVideoDevices[0].id,
        height: cameraVideoStreamDefaultHeight,
        width: cameraVideoStreamDefaultWidth,
        frameRate: cameraVideoStreamDefaultFrameRate
    });

    let audioPublication;
    let videoPublication;

    // Change audio input source
    audioSelect.addEventListener("change", async function () {
        let selectedValue = this.value;

        try {
            audio = await SkyWayStreamFactory.createMicrophoneAudioStream({ deviceId: selectedValue });
        } catch (error) {
            console.error("Error occurred while creating microphone audio stream:", error);
        }
    });

    // Change video input source
    videoSelect.addEventListener("change", async function () {
        let selectedValue = this.value;

        try {
            video = await SkyWayStreamFactory.createCameraVideoStream({
                deviceId: selectedValue,
                height: cameraVideoStreamDefaultHeight,
                width: cameraVideoStreamDefaultWidth,
                frameRate: cameraVideoStreamDefaultFrameRate
            });
        } catch (error) {
            console.error("Error occurred while creating video stream:", error);
        }
    });

    await SkyWayStreamFactory.enumerateDevices()
        .then(function (deviceInfos) {
            for (var i = 0; i !== deviceInfos.length; ++i) {
                let deviceInfo = deviceInfos[i];
                let option = document.createElement('option');
                option.value = deviceInfo.id;
                option.text = deviceInfo.label;
                if (deviceInfo.kind === 'audioinput') {
                    audioSelect.appendChild(option);
                } else if (deviceInfo.kind === 'videoinput') {
                    videoSelect.appendChild(option);
                }
            }
        }).catch(function (error) {
            console.error('mediaDevices.enumerateDevices() error:', error);

            return;
        });

    video.attach(localVideo); // 3
    await localVideo.play(); // 4

    // screen sharing
    shareScreenButton.onclick = async () => {
        try {
            // Do nothing before publishing
            if (typeof audioPublication === "undefined") return;

            // ①生のWeb-RTCで実装している(v2?)
            // const captureStream =
            //     await navigator.mediaDevices.getDisplayMedia({ video: true });
            // const displayVideoTrack = captureStream.getVideoTracks();
            // const newStream = new LocalVideoStream(displayVideoTrack[0]);

            // await videoPublication.replaceStream(newStream, { releaseOldStream: false });

            // ②v3
            const newStream = await SkyWayStreamFactory.createDisplayStreams();

            await videoPublication.replaceStream(newStream.video, { releaseOldStream: false });

            // TODO: 自分のカメラを映したまま画面共有を行う

        } catch (error) {
            console.error(`Error: ${error}`);
        };
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
                muteButton.innerText = "unmute"
            }
            else if (state === "disabled") {
                // Unmute
                await audioPublication.enable();
                muteButton.innerText = "mute"
            }
            else {
                return;
            }
        } catch (error) {
            console.error(`Error: ${error}`);
        }
    };

    // Create the channel
    joinButton.onclick = async () => {
        if (channelNameInput.value === '') return;

        try {

            const context = await SkyWayContext.Create(token);
            const sfuBotPlugin = new SfuBotPlugin();

            context.registerPlugin(sfuBotPlugin);

            // Search channel or create
            const channel = await SkyWayChannel.FindOrCreate(context, {
                name: channelNameInput.value,
                metadata: 'something',
            });

            const bot = await sfuBotPlugin.createBot(channel);
            const maxSubscribers = 2;

            // Save the member
            const me = await channel.join();
            myId.textContent = me.id;

            // Publish audio
            audioPublication = await me.publish(
                audio,
            );
            // Mute for default
            await audioPublication.disable();

            // Publish video
            videoPublication = await me.publish(
                video,
                {
                    encodings: [
                        {
                            scaleResolutionDownBy: 4,
                            id: 'low',
                            maxBitrate: 80_000,
                            maxFramerate: 5
                        },
                        {
                            scaleResolutionDownBy: 1,
                            id: 'high',
                            maxBitrate: 400_000,
                            maxFramerate: 30
                        }
                    ],
                });

            await bot.startForwarding(audioPublication,
                {
                    maxSubscribers: maxSubscribers,
                });

            await bot.startForwarding(videoPublication,
                {
                    maxSubscribers: maxSubscribers,
                });

            const subscribeAndAttach = (publication) => {
                // 3
                if (publication.publisher.subtype != 'sfu' || publication.origin.publisher.id === me.id) return;

                const subscribeButton = document.createElement('button'); // 3-1
                subscribeButton.textContent = `${publication.publisher.id}: ${publication.contentType}`;

                buttonArea.appendChild(subscribeButton);

                subscribeButton.onclick = async () => {
                    // 3-2
                    const { stream } = await me.subscribe(publication, { preferredEncodingId: 'low' }); // 3-2-1

                    let newMedia; // 3-2-2
                    switch (stream.track.kind) {
                        case 'video':
                            newMedia = document.createElement('video');
                            newMedia.playsInline = true;
                            newMedia.autoplay = true;
                            newMedia.id = stream.id;
                            newMedia.onclick = switchEncodingSetting;
                            break;
                        case 'audio':
                            newMedia = document.createElement('audio');
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
                const subscription = me.subscriptions.find((subscription) => subscription.stream.id == videoId);

                if (subscription.preferredEncoding === 'high') {
                    subscription.changePreferredEncoding('low');
                } else if (subscription.preferredEncoding === 'low') {
                    subscription.changePreferredEncoding('high');
                }
            };

            channel.publications.forEach(subscribeAndAttach); // 1
            channel.onStreamPublished.add((e) => subscribeAndAttach(e.publication));
        } catch (error) {
            console.error(`Error: ${error}`);
        }
    };
})(); // 1

