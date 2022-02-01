const editly = require('.')

/* eslint-disable spaced-comment,no-param-reassign */
const width = 720
const height = 1280
const fps = 30
const outputPath = './outputs/2952.mp4'
const keepSourceAudio = true
const defaultTransition = 'fade'
const duration = 5
const introImagePath = './examples/assets/intro.png'
const logoPath = './examples/assets/logo.png'
const wemoovTalentLogoPath = './examples/assets/wemoov-talents.png'

var jobTitle = 'Développeur Mobile'
var profilePicturePath = './examples/assets/imageResize.png'
var fullName = 'AVERTY Alexis'
var mobility = 'Loire Atlantique'
var videos = [
  './examples/assets/file0.mp4',
  './examples/assets/file1.mp4',
  './examples/assets/file2.mp4',
  './examples/assets/file3.mp4',
  './examples/assets/file4.mp4',
]
var endText = '\nAVERTY Alexis\n\nDéveloppeur Mobile\n\n3 années d\'expérience\n\nLoire Atlantique\n\nwww.wemoov.fr'

if (videos.length === 5) {
  editly({
    width: width,
    height: height,
    fps: fps,
    outPath: outputPath,
    keepSourceAudio: keepSourceAudio,
    defaults: {
      transition: {
        name: defaultTransition
      },
      zoomDirection: null,
    },
    clips: [
      {
        duration: duration,
        layers: [
          {
            type: 'image',
            path: introImagePath,
            zoomDirection: null,
          },
          {
            type: 'title',
            text: jobTitle,
            position: 'top',
            zoomDirection: null,
            fontSize: 0.075,
          },
          {
            type: 'image-overlay',
            path: profilePicturePath,
            position: 'center',
            width: 0.6,
          },
          {
            type: 'title',
            text: fullName,
            zoomDirection: null,
            position: {
              originX: 'center',
              originY: 'bottom',
              y: 0.8
            },
            fontSize: 0.075
          },
          {
            type: 'title',
            text: mobility,
            zoomDirection: null,

            position: {
              originX: 'center',
              originY: 'bottom',
              y: 0.9
            },
            fontSize: 0.075
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Présentez vous',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[0],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Dernières Expériences',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[1],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Objectifs Professionnels',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[2],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Atouts & Valeurs',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[3],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Hobbies',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[4],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'image',
            path: introImagePath,
            zoomDirection: null
          },
          {
            type: 'image-overlay',
            path: wemoovTalentLogoPath,
            position: {
              originX: 'center',
              originY: 'top',
              y: 0.1
            },
            width: 0.6,
          },
          {
            type: 'title',
            text: endText,
            zoomDirection: null,
            position: {
              originX: 'center',
              originY: 'top',
              y: 0.45
            },
            fontSize: 0.075
          },
        ]
      }
    ],
  }).catch(console.error);
} else {
  editly({
    width: width,
    height: height,
    fps: fps,
    outPath: outputPath,
    keepSourceAudio: keepSourceAudio,
    defaults: {
      transition: {
        name: defaultTransition
      },
      zoomDirection: null,
    },
    clips: [
      {
        duration: duration,
        layers: [
          {
            type: 'image',
            path: introImagePath,
            zoomDirection: null,
          },
          {
            type: 'title',
            text: jobTitle,
            position: 'top',
            zoomDirection: null,
            fontSize: 0.075,
          },
          {
            type: 'image-overlay',
            path: profilePicturePath,
            position: 'center',
            width: 0.6,
          },
          {
            type: 'title',
            text: fullName,
            zoomDirection: null,
            position: {
              originX: 'center',
              originY: 'bottom',
              y: 0.8
            },
            fontSize: 0.075
          },
          {
            type: 'title',
            text: mobility,
            zoomDirection: null,

            position: {
              originX: 'center',
              originY: 'bottom',
              y: 0.9
            },
            fontSize: 0.075
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Présentez vous',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[0],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Dernières Expériences',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[1],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Objectifs Professionnels',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[2],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'title-background',
            background: {
              type: 'fill-color',
              color: '#687EC7'
            },
            text: 'Vos Atouts & Valeurs',
            zoomDirection: null
          }
        ]
      },
      {
        layers: [
          {
            type: 'video',
            path: videos[3],
            resizeMode: 'cover'
          },
          {
            type: 'image-overlay',
            path: logoPath,
            position: 'top-left',
            width: 0.4
          }
        ]
      },
      {
        duration: duration,
        layers: [
          {
            type: 'image',
            path: introImagePath,
            zoomDirection: null
          },
          {
            type: 'image-overlay',
            path: wemoovTalentLogoPath,
            position: {
              originX: 'center',
              originY: 'top',
              y: 0.1
            },
            width: 0.6,
          },
          {
            type: 'title',
            text: endText,
            zoomDirection: null,
            position: {
              originX: 'center',
              originY: 'top',
              y: 0.45
            },
            fontSize: 0.075
          },
        ]
      }
    ],
  }).catch(console.error);
}
