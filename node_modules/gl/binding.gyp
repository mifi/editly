{
  'variables': {
    'platform': '<(OS)',
  },
  'conditions': [
    ['platform == "mac"', {'variables': {'platform': 'darwin'}}],
    ['platform == "win"', {'variables': {'platform': 'win32'}}]
  ],
  'targets': [
    {
      'target_name': 'webgl',
      'defines': [
        'VERSION=1.0.0'
      ],
      'sources': [
          'src/native/bindings.cc',
          'src/native/webgl.cc',
          'src/native/procs.cc'
      ],
      'include_dirs': [
        "<!(node -e \"require('nan')\")",
        '<(module_root_dir)/deps/include',
        "angle/include"
      ],
      'library_dirs': [
        '<(module_root_dir)/deps/<(platform)'
      ],
      'conditions': [
        ['OS=="mac"', {
            'dependencies':
            [
              'angle/src/angle.gyp:libEGL',
              'angle/src/angle.gyp:libGLESv2'
            ],
            'libraries': [
                '-framework QuartzCore',
                '-framework Quartz'
            ],
            'xcode_settings': {
              'GCC_ENABLE_CPP_RTTI': 'YES',
              'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
              'MACOSX_DEPLOYMENT_TARGET':'10.8',
              'CLANG_CXX_LIBRARY': 'libc++',
              'CLANG_CXX_LANGUAGE_STANDARD':'c++14',
              'GCC_VERSION': 'com.apple.compilers.llvm.clang.1_0'
            },
        }],
        ['OS=="linux"', {
            'dependencies':
            [
              'angle/src/angle.gyp:libEGL',
              'angle/src/angle.gyp:libGLESv2'
            ]
        }],
        ['OS=="win"', {
            'library_dirs': [
              '<(module_root_dir)/deps/windows/lib/<(target_arch)',
            ],
            'libraries': [
              'libEGL.lib',
              'libGLESv2.lib'
            ],
            'defines' : [
              'WIN32_LEAN_AND_MEAN',
              'VC_EXTRALEAN'
            ],
            'configurations': {
              'Release': {
                'msvs_settings': {
                  'VCCLCompilerTool': {
                    'RuntimeLibrary': 0, # static release
                    'Optimization': 0, # /Od, disabled
                    'FavorSizeOrSpeed': 1, # /Ot, favour speed over size
                    'InlineFunctionExpansion': 2, # /Ob2, inline anything eligible
                    'WholeProgramOptimization': 'false', # No
                    'OmitFramePointers': 'true',
                    'EnableFunctionLevelLinking': 'true',
                    'EnableIntrinsicFunctions': 'true',
                    'RuntimeTypeInfo': 'false',
                    'ExceptionHandling': '0',
                    'AdditionalOptions': [
                      '/MP', # compile across multiple CPUs
                    ]
                  },
                  'VCLinkerTool': {
                    'LinkTimeCodeGeneration': 0, # Link Time Code generation default
                    'OptimizeReferences': 1, # /OPT:NOREF
                    'EnableCOMDATFolding': 1, # /OPT:NOICF
                    'LinkIncremental': 2, # /INCREMENTAL
                    'AdditionalOptions': [
                      '/LTCG:OFF',
                    ]
                  }
                },
                'msvs_configuration_attributes':
                {
                    'OutputDirectory': '$(SolutionDir)$(ConfigurationName)',
                    'IntermediateDirectory': '$(OutDir)\\obj\\$(ProjectName)'
                }
              }
            },
            "copies": [
              {
                'destination': '$(SolutionDir)$(ConfigurationName)',
                'files': [
                  '<(module_root_dir)/deps/windows/dll/<(target_arch)/libEGL.dll',
                  '<(module_root_dir)/deps/windows/dll/<(target_arch)/libGLESv2.dll',
                  '<(module_root_dir)/deps/windows/dll/<(target_arch)/d3dcompiler_47.dll'
                ]
              }
           ]
          }
        ]
      ]
    }
  ]
}
