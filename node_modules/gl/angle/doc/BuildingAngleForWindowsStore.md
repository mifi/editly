# How to build ANGLE for Windows Store

ANGLE provides OpenGL ES 2.0 and EGL 1.4 libraries and dlls.  You can use these to build and run OpenGL ES 2.0 applications on Windows.

## Development setup

ANGLE for Windows Store uses most of the same steps found in [ANGLE Development](DevSetup.md) with a few changes.

### Required Tools
 * [Visual Studio Community 2015](http://www.visualstudio.com/downloads/download-visual-studio-vs)
   * Required to build ANGLE on Windows and for the packaged Windows 8.1 SDK.


### Getting the source
Set the following environment variables as needed:

 * `GYP_GENERATORS` to `msvs`
 * `GYP_MSVS_VERSION` to `2015`
 * `GYP_GENERATE_WINRT` to `1`

Download the ANGLE source by running the following commands:

```
git clone https://chromium.googlesource.com/angle/angle
python angle/scripts/bootstrap.py
gclient sync
git checkout master
```

Gyp will generate multiple VS2015 solution files
 * `winrt/10/src/angle.sln` for Windows 10
 * `winrt/8.1/windows/src/angle.sln` for Windows 8.1
 * `winrt/8.1/windowsphone/src/angle.sln` for Windows Phone 8.1


### Building ANGLE
 1. Open one of the ANGLE Visual Studio solution files (see [Getting the source](BuildingAngleForWindowsStore.md#Development-setup-Getting-the-source)).
 2. Select Build -> Configuration Manager
 3. In the "Active solution configuration:" drop down, select the desired configuration (eg. Release), and close the Configuration Manager.
 4. Select Build -> Build Solution.
Once the build completes, the output directory for your selected configuration (eg. `Release_Win32`, located next to the solution file) will contain the required libraries and dlls to build and run an OpenGL ES 2.0 application.

### To Use ANGLE in Your Application
 1. A template for creating a Windows Store application that uses ANGLE can be found [here](http://blogs.msdn.com/b/vcblog/archive/2015/07/30/cross-platform-code-sharing-with-visual-c.aspx).
 2. Configure your build environment to have access to the `include` folder to provide access to the standard Khronos EGL and GLES2 header files.
  * For Visual C++
     * Right-click your project in the _Solution Explorer_, and select _Properties_.
     * Under the _Configuration Properties_ branch, click _C/C++_.
     * Add the relative path to the Khronos EGL and GLES2 header files to _Additional Include Directories_.
 3. Configure your build environment to have access to `libEGL.lib` and `libGLESv2.lib` found in the build output directory (see [Building ANGLE](DevSteup.md#Building-ANGLE)).
   * For Visual C++
     * Right-click your project in the _Solution Explorer_, and select _Properties_.
     * Under the _Configuration Properties_ branch, open the _Linker_ branch and click _Input_.
     * Add the relative paths to both the `libEGL.lib` file and `libGLESv2.lib` file to _Additional Dependencies_, separated by a semicolon.
 4. Copy `libEGL.dll` and `libGLESv2.dll` from the build output directory (see [Building ANGLE](DevSetup.md#Building-ANGLE)) into your application folder or packages location if a ANGLE Windows Store NuGet was used.
 5. Code your application to the Khronos [OpenGL ES 2.0](http://www.khronos.org/registry/gles/) and [EGL 1.4](http://www.khronos.org/registry/egl/) APIs.

