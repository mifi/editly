cmd_Release/EGL.a := rm -f Release/EGL.a && ./gyp-mac-tool filter-libtool libtool  -static -o Release/EGL.a Release/obj.target/libEGL/angle/src/libEGL/libEGL.o
