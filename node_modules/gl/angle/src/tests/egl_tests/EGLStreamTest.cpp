//
// Copyright 2016 The ANGLE Project Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// EGLStreamTest:
//   Tests pertaining to egl::Stream.
//

#include <gtest/gtest.h>

#include <vector>

#include "OSWindow.h"
#include "test_utils/ANGLETest.h"

using namespace angle;

namespace
{

class EGLStreamTest : public ANGLETest
{
  protected:
    EGLStreamTest()
    {
        setWindowWidth(128);
        setWindowHeight(128);
        setConfigRedBits(8);
        setConfigGreenBits(8);
        setConfigBlueBits(8);
        setConfigAlphaBits(8);
        setConfigDepthBits(24);
    }
};

// Tests validation of the stream API
TEST_P(EGLStreamTest, StreamValidationTest)
{
    EGLWindow *window            = getEGLWindow();
    const char *extensionsString = eglQueryString(EGL_NO_DISPLAY, EGL_EXTENSIONS);
    if (strstr(extensionsString, "EGL_KHR_stream") == nullptr)
    {
        std::cout << "Stream extension not supported" << std::endl;
        return;
    }

    EGLDisplay display = window->getDisplay();

    const EGLint streamAttributesBad[] = {
        EGL_STREAM_STATE_KHR,
        0,
        EGL_NONE,
        EGL_PRODUCER_FRAME_KHR,
        0,
        EGL_NONE,
        EGL_CONSUMER_FRAME_KHR,
        0,
        EGL_NONE,
        EGL_CONSUMER_LATENCY_USEC_KHR,
        -1,
        EGL_NONE,
        EGL_RED_SIZE,
        EGL_DONT_CARE,
        EGL_NONE,
    };

    // Validate create stream attributes
    EGLStreamKHR stream = eglCreateStreamKHR(display, &streamAttributesBad[0]);
    ASSERT_EGL_ERROR(EGL_BAD_ACCESS);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    stream = eglCreateStreamKHR(display, &streamAttributesBad[3]);
    ASSERT_EGL_ERROR(EGL_BAD_ACCESS);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    stream = eglCreateStreamKHR(display, &streamAttributesBad[6]);
    ASSERT_EGL_ERROR(EGL_BAD_ACCESS);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    stream = eglCreateStreamKHR(display, &streamAttributesBad[9]);
    ASSERT_EGL_ERROR(EGL_BAD_PARAMETER);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    stream = eglCreateStreamKHR(display, &streamAttributesBad[12]);
    ASSERT_EGL_ERROR(EGL_BAD_ATTRIBUTE);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    const EGLint streamAttributes[] = {
        EGL_CONSUMER_LATENCY_USEC_KHR, 0, EGL_NONE,
    };

    stream = eglCreateStreamKHR(EGL_NO_DISPLAY, streamAttributes);
    ASSERT_EGL_ERROR(EGL_BAD_DISPLAY);
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    // Create an actual stream
    stream = eglCreateStreamKHR(display, streamAttributes);
    ASSERT_EGL_SUCCESS();
    ASSERT_EQ(EGL_NO_STREAM_KHR, stream);

    // Assert it is in the created state
    EGLint state;
    eglQueryStreamKHR(display, stream, EGL_STREAM_STATE_KHR, &state);
    ASSERT_EGL_SUCCESS();
    ASSERT_EQ(EGL_STREAM_STATE_CREATED_KHR, state);

    // Test getting and setting the latency
    EGLint latency = 10;
    eglStreamAttribKHR(display, stream, EGL_CONSUMER_LATENCY_USEC_KHR, latency);
    ASSERT_EGL_SUCCESS();
    eglQueryStreamKHR(display, stream, EGL_CONSUMER_LATENCY_USEC_KHR, &latency);
    ASSERT_EGL_SUCCESS();
    ASSERT_EQ(10, latency);
    eglStreamAttribKHR(display, stream, EGL_CONSUMER_LATENCY_USEC_KHR, -1);
    ASSERT_EGL_ERROR(EGL_BAD_PARAMETER);
    ASSERT_EQ(10, latency);

    // Test the 64-bit queries
    EGLuint64KHR value;
    eglQueryStreamu64KHR(display, stream, EGL_CONSUMER_FRAME_KHR, &value);
    ASSERT_EGL_SUCCESS();
    eglQueryStreamu64KHR(display, stream, EGL_PRODUCER_FRAME_KHR, &value);
    ASSERT_EGL_SUCCESS();

    // Destroy the stream
    eglDestroyStreamKHR(display, stream);
    ASSERT_EGL_SUCCESS();
}

ANGLE_INSTANTIATE_TEST(EGLStreamTest,
                       ES2_D3D9(),
                       ES2_D3D11(),
                       ES3_D3D11(),
                       ES2_OPENGL(),
                       ES3_OPENGL());
}  // anonymous namespace
