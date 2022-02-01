#include <cstring>
#include <vector>
#include <iostream>

#include "webgl.h"

bool                   WebGLRenderingContext::HAS_DISPLAY = false;
EGLDisplay             WebGLRenderingContext::DISPLAY;
WebGLRenderingContext* WebGLRenderingContext::ACTIVE = NULL;
WebGLRenderingContext* WebGLRenderingContext::CONTEXT_LIST_HEAD = NULL;

const char* REQUIRED_EXTENSIONS[] = {
  "GL_OES_packed_depth_stencil",
  "GL_ANGLE_instanced_arrays",
  NULL
};

#define GL_METHOD(method_name) NAN_METHOD(WebGLRenderingContext:: method_name)

#define GL_BOILERPLATE  \
  Nan::HandleScope();\
  if (info.This()->InternalFieldCount() <= 0) { \
    return Nan::ThrowError("Invalid WebGL Object"); \
  } \
  WebGLRenderingContext* inst = \
    node::ObjectWrap::Unwrap<WebGLRenderingContext>(info.This()); \
  if (!(inst && inst->setActive())) { \
    return Nan::ThrowError("Invalid GL context"); \
  }

WebGLRenderingContext::WebGLRenderingContext(
    int width
  , int height
  , bool alpha
  , bool depth
  , bool stencil
  , bool antialias
  , bool premultipliedAlpha
  , bool preserveDrawingBuffer
  , bool preferLowPowerToHighPerformance
  , bool failIfMajorPerformanceCaveat) :
      state(GLCONTEXT_STATE_INIT)
    , unpack_flip_y(false)
    , unpack_premultiply_alpha(false)
    , unpack_colorspace_conversion(0x9244)
    , unpack_alignment(4)
    , next(NULL)
    , prev(NULL)
    , lastError(GL_NO_ERROR) {

  //Get display
  if (!HAS_DISPLAY) {
    DISPLAY = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (DISPLAY == EGL_NO_DISPLAY) {
      state = GLCONTEXT_STATE_ERROR;
      return;
    }

    //Initialize EGL
    if (!eglInitialize(DISPLAY, NULL, NULL)) {
      state = GLCONTEXT_STATE_ERROR;
      return;
    }

    //Save display
    HAS_DISPLAY = true;
  }

  //Set up configuration
  EGLint attrib_list[] = {
      EGL_SURFACE_TYPE, EGL_PBUFFER_BIT
    , EGL_RED_SIZE,     8
    , EGL_GREEN_SIZE,   8
    , EGL_BLUE_SIZE,    8
    , EGL_ALPHA_SIZE,   8
    , EGL_DEPTH_SIZE,   24
    , EGL_STENCIL_SIZE, 8
    , EGL_NONE
  };
  EGLint num_config;
  if (!eglChooseConfig(
      DISPLAY,
      attrib_list,
      &config,
      1,
      &num_config) ||
      num_config != 1) {
    state = GLCONTEXT_STATE_ERROR;
    return;
  }

  //Create context
  EGLint contextAttribs[] = {
    EGL_CONTEXT_CLIENT_VERSION, 2,
    EGL_NONE
  };
  context = eglCreateContext(DISPLAY, config, EGL_NO_CONTEXT, contextAttribs);
  if (context == EGL_NO_CONTEXT) {
    state = GLCONTEXT_STATE_ERROR;
    return;
  }

  EGLint surfaceAttribs[] = {
        EGL_WIDTH,  (EGLint)width
      , EGL_HEIGHT, (EGLint)height
      , EGL_NONE
  };
  surface = eglCreatePbufferSurface(DISPLAY, config, surfaceAttribs);
  if (surface == EGL_NO_SURFACE) {
    state = GLCONTEXT_STATE_ERROR;
    return;
  }

  //Set active
  if (!eglMakeCurrent(DISPLAY, surface, surface, context)) {
    state = GLCONTEXT_STATE_ERROR;
    return;
  }

  //Success
  state = GLCONTEXT_STATE_OK;
  registerContext();
  ACTIVE = this;

  //Initialize function pointers
  initPointers();

  //Check extensions
  const char *extensionString = (const char*)((glGetString)(GL_EXTENSIONS));

  //Load required extensions
  for(const char** rext = REQUIRED_EXTENSIONS; *rext; ++rext) {
    if(!strstr(extensionString, *rext)) {
      dispose();
      state = GLCONTEXT_STATE_ERROR;
      return;
    }
  }

  //Select best preferred depth
  preferredDepth = GL_DEPTH_COMPONENT16;
  if(strstr(extensionString, "GL_OES_depth32")) {
    preferredDepth = GL_DEPTH_COMPONENT32_OES;
  } else if(strstr(extensionString, "GL_OES_depth24")) {
    preferredDepth = GL_DEPTH_COMPONENT24_OES;
  }
}

bool WebGLRenderingContext::setActive() {
  if (state != GLCONTEXT_STATE_OK) {
    return false;
  }
  if (this == ACTIVE) {
    return true;
  }
  if (!eglMakeCurrent(DISPLAY, surface, surface, context)) {
    state = GLCONTEXT_STATE_ERROR;
    return false;
  }
  ACTIVE = this;
  return true;
}

void WebGLRenderingContext::setError(GLenum error) {
  if (error == GL_NO_ERROR || lastError != GL_NO_ERROR) {
    return;
  }
  GLenum prevError = (this->glGetError)();
  if (prevError == GL_NO_ERROR) {
    lastError = error;
  }
}

void WebGLRenderingContext::dispose() {
  //Unregister context
  unregisterContext();

  if (!setActive()) {
    state = GLCONTEXT_STATE_ERROR;
    return;
  }

  //Update state
  state = GLCONTEXT_STATE_DESTROY;

  //Store this pointer
  WebGLRenderingContext* inst = this;

  //Destroy all object references
  for (
    std::map< std::pair<GLuint, GLObjectType>, bool >::iterator
     iter = objects.begin();
     iter != objects.end();
     ++iter) {

    GLuint obj = iter->first.first;

    switch(iter->first.second) {
      case GLOBJECT_TYPE_PROGRAM:
        (inst->glDeleteProgram)(obj);
        break;
      case GLOBJECT_TYPE_BUFFER:
        (inst->glDeleteBuffers)(1,&obj);
        break;
      case GLOBJECT_TYPE_FRAMEBUFFER:
        (inst->glDeleteFramebuffers)(1,&obj);
        break;
      case GLOBJECT_TYPE_RENDERBUFFER:
        (inst->glDeleteRenderbuffers)(1,&obj);
        break;
      case GLOBJECT_TYPE_SHADER:
        (inst->glDeleteShader)(obj);
        break;
      case GLOBJECT_TYPE_TEXTURE:
        (inst->glDeleteTextures)(1,&obj);
        break;
      case GLOBJECT_TYPE_VERTEX_ARRAY:
        (inst->glDeleteVertexArraysOES)(1,&obj);
        break;
      default:
        break;
    }
  }

  //Deactivate context
  eglMakeCurrent(DISPLAY, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  ACTIVE = NULL;

  //Destroy surface and context

  //FIXME:  This shouldn't be commented out
  //eglDestroySurface(DISPLAY, surface);
  eglDestroyContext(DISPLAY, context);
}

WebGLRenderingContext::~WebGLRenderingContext() {
  dispose();
}

GL_METHOD(SetError) {
  GL_BOILERPLATE;
  inst->setError((GLenum)(Nan::To<int32_t>(info[0]).ToChecked()));
}

GL_METHOD(DisposeAll) {
  Nan::HandleScope();

  while(CONTEXT_LIST_HEAD) {
    CONTEXT_LIST_HEAD->dispose();
  }

  if(WebGLRenderingContext::HAS_DISPLAY) {
    eglTerminate(WebGLRenderingContext::DISPLAY);
    WebGLRenderingContext::HAS_DISPLAY = false;
  }
}

GL_METHOD(New) {
  Nan::HandleScope();

  WebGLRenderingContext* instance = new WebGLRenderingContext(
      Nan::To<int32_t>(info[0]).ToChecked()   //Width
    , Nan::To<int32_t>(info[1]).ToChecked()   //Height
    , (Nan::To<bool>(info[2]).ToChecked()) //Alpha
    , (Nan::To<bool>(info[3]).ToChecked()) //Depth
    , (Nan::To<bool>(info[4]).ToChecked()) //Stencil
    , (Nan::To<bool>(info[5]).ToChecked()) //antialias
    , (Nan::To<bool>(info[6]).ToChecked()) //premultipliedAlpha
    , (Nan::To<bool>(info[7]).ToChecked()) //preserve drawing buffer
    , (Nan::To<bool>(info[8]).ToChecked()) //low power
    , (Nan::To<bool>(info[9]).ToChecked()) //fail if crap
  );

  if(instance->state != GLCONTEXT_STATE_OK){
    return Nan::ThrowError("Error creating WebGLContext");
  }

  instance->Wrap(info.This());

  info.GetReturnValue().Set(info.This());
}

GL_METHOD(Destroy) {
  GL_BOILERPLATE

  inst->dispose();
}

GL_METHOD(Uniform1f) {
  GL_BOILERPLATE;

  int location = Nan::To<int32_t>(info[0]).ToChecked();
  float x = (float) Nan::To<double>(info[1]).ToChecked();

  (inst->glUniform1f)(location, x);
}

GL_METHOD(Uniform2f) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());

  (inst->glUniform2f)(location, x, y);
}

GL_METHOD(Uniform3f) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());
  GLfloat z = static_cast<GLfloat>(Nan::To<double>(info[3]).ToChecked());

  (inst->glUniform3f)(location, x, y, z);
}

GL_METHOD(Uniform4f) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());
  GLfloat z = static_cast<GLfloat>(Nan::To<double>(info[3]).ToChecked());
  GLfloat w = static_cast<GLfloat>(Nan::To<double>(info[4]).ToChecked());

  (inst->glUniform4f)(location, x, y, z, w);
}

GL_METHOD(Uniform1i) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLint x = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glUniform1i)(location, x);
}

GL_METHOD(Uniform2i) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLint x = Nan::To<int32_t>(info[1]).ToChecked();
  GLint y = Nan::To<int32_t>(info[2]).ToChecked();

  (inst->glUniform2i)(location, x, y);
}

GL_METHOD(Uniform3i) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLint x = Nan::To<int32_t>(info[1]).ToChecked();
  GLint y = Nan::To<int32_t>(info[2]).ToChecked();
  GLint z = Nan::To<int32_t>(info[3]).ToChecked();

  (inst->glUniform3i)(location, x, y, z);
}

GL_METHOD(Uniform4i) {
  GL_BOILERPLATE;

  GLint location = Nan::To<int32_t>(info[0]).ToChecked();
  GLint x = Nan::To<int32_t>(info[1]).ToChecked();
  GLint y = Nan::To<int32_t>(info[2]).ToChecked();
  GLint z = Nan::To<int32_t>(info[3]).ToChecked();
  GLint w = Nan::To<int32_t>(info[4]).ToChecked();

  (inst->glUniform4i)(location, x, y, z, w);
}


GL_METHOD(PixelStorei) {
  GL_BOILERPLATE;

  GLenum pname = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum param = Nan::To<int32_t>(info[1]).ToChecked();

  //Handle WebGL specific extensions
  switch(pname) {
    case 0x9240:
      inst->unpack_flip_y = param != 0;
    break;

    case 0x9241:
      inst->unpack_premultiply_alpha = param != 0;
    break;

    case 0x9243:
      inst->unpack_colorspace_conversion = param;
    break;

    case GL_UNPACK_ALIGNMENT:
      inst->unpack_alignment = param;
      (inst->glPixelStorei)(pname, param);
    break;

    case GL_MAX_DRAW_BUFFERS_EXT:
      (inst->glPixelStorei)(pname, param);
    break;

    default:
      (inst->glPixelStorei)(pname, param);
    break;
  }
}

GL_METHOD(BindAttribLocation) {
  GL_BOILERPLATE;

  GLint program = Nan::To<int32_t>(info[0]).ToChecked();
  GLint index   = Nan::To<int32_t>(info[1]).ToChecked();
  Nan::Utf8String name(info[2]);

  (inst->glBindAttribLocation)(program, index, *name);
}

GLenum WebGLRenderingContext::getError() {
  GLenum error = (this->glGetError)();
  if (lastError != GL_NO_ERROR) {
    error = lastError;
  }
  lastError = GL_NO_ERROR;
  return error;
}

GL_METHOD(GetError) {
  GL_BOILERPLATE;
  info.GetReturnValue().Set(Nan::New<v8::Integer>(inst->getError()));
}

GL_METHOD(VertexAttribDivisor) {
  GL_BOILERPLATE;

  GLuint index   = Nan::To<uint32_t>(info[0]).ToChecked();
  GLuint divisor = Nan::To<uint32_t>(info[1]).ToChecked();

  (inst->glVertexAttribDivisor)(index, divisor);
}

GL_METHOD(DrawArraysInstanced) {
  GL_BOILERPLATE;

  GLenum  mode   = Nan::To<int32_t>(info[0]).ToChecked();
  GLint   first  = Nan::To<int32_t>(info[1]).ToChecked();
  GLuint  count  = Nan::To<uint32_t>(info[2]).ToChecked();
  GLuint  icount = Nan::To<uint32_t>(info[3]).ToChecked();

  (inst->glDrawArraysInstanced)(mode, first, count, icount);
}

GL_METHOD(DrawElementsInstanced) {
  GL_BOILERPLATE;

  GLenum mode   = Nan::To<int32_t>(info[0]).ToChecked();
  GLint  count  = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum type   = Nan::To<int32_t>(info[2]).ToChecked();
  GLint  offset = Nan::To<int32_t>(info[3]).ToChecked();
  GLuint icount = Nan::To<uint32_t>(info[4]).ToChecked();

  (inst->glDrawElementsInstanced)(
    mode,
    count,
    type,
    reinterpret_cast<GLvoid*>(offset),
    icount);
}

GL_METHOD(DrawArrays) {
  GL_BOILERPLATE;

  GLenum mode  = Nan::To<int32_t>(info[0]).ToChecked();
  GLint  first = Nan::To<int32_t>(info[1]).ToChecked();
  GLint  count = Nan::To<int32_t>(info[2]).ToChecked();

  (inst->glDrawArrays)(mode, first, count);
}

GL_METHOD(UniformMatrix2fv) {
  GL_BOILERPLATE;

  GLint location      = Nan::To<int32_t>(info[0]).ToChecked();
  GLboolean transpose = (Nan::To<bool>(info[1]).ToChecked());
  Nan::TypedArrayContents<GLfloat> data(info[2]);

  (inst->glUniformMatrix2fv)(location, data.length() / 4, transpose, *data);
}

GL_METHOD(UniformMatrix3fv) {
  GL_BOILERPLATE;

  GLint     location  = Nan::To<int32_t>(info[0]).ToChecked();
  GLboolean transpose = (Nan::To<bool>(info[1]).ToChecked());
  Nan::TypedArrayContents<GLfloat> data(info[2]);

  (inst->glUniformMatrix3fv)(location, data.length() / 9, transpose, *data);
}

GL_METHOD(UniformMatrix4fv) {
  GL_BOILERPLATE;

  GLint     location  = Nan::To<int32_t>(info[0]).ToChecked();
  GLboolean transpose = (Nan::To<bool>(info[1]).ToChecked());
  Nan::TypedArrayContents<GLfloat> data(info[2]);

  (inst->glUniformMatrix4fv)(location, data.length() / 16, transpose, *data);
}

GL_METHOD(GenerateMipmap) {
  GL_BOILERPLATE;

  GLint target = Nan::To<int32_t>(info[0]).ToChecked();
  (inst->glGenerateMipmap)(target);
}

GL_METHOD(GetAttribLocation) {
  GL_BOILERPLATE;

  GLint program = Nan::To<int32_t>(info[0]).ToChecked();
  Nan::Utf8String name(info[1]);

  GLint result = (inst->glGetAttribLocation)(program, *name);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(result));
}


GL_METHOD(DepthFunc) {
  GL_BOILERPLATE;

  (inst->glDepthFunc)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(Viewport) {
  GL_BOILERPLATE;

  GLint   x       = Nan::To<int32_t>(info[0]).ToChecked();
  GLint   y       = Nan::To<int32_t>(info[1]).ToChecked();
  GLsizei width   = Nan::To<int32_t>(info[2]).ToChecked();
  GLsizei height  = Nan::To<int32_t>(info[3]).ToChecked();

  (inst->glViewport)(x, y, width, height);
}

GL_METHOD(CreateShader) {
  GL_BOILERPLATE;

  GLuint shader=(inst->glCreateShader)(Nan::To<int32_t>(info[0]).ToChecked());
  inst->registerGLObj(GLOBJECT_TYPE_SHADER, shader);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(shader));
}


GL_METHOD(ShaderSource) {
  GL_BOILERPLATE;

  GLint id = Nan::To<int32_t>(info[0]).ToChecked();
  Nan::Utf8String code(info[1]);

  const char* codes[] = { *code };
  GLint length = code.length();

  (inst->glShaderSource)(id, 1, codes, &length);
}


GL_METHOD(CompileShader) {
  GL_BOILERPLATE;

  (inst->glCompileShader)(Nan::To<int32_t>(info[0]).ToChecked());
}

GL_METHOD(FrontFace) {
  GL_BOILERPLATE;

  (inst->glFrontFace)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(GetShaderParameter) {
  GL_BOILERPLATE;

  GLint shader = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname = Nan::To<int32_t>(info[1]).ToChecked();

  GLint value;
  (inst->glGetShaderiv)(shader, pname, &value);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(value));
}

GL_METHOD(GetShaderInfoLog) {
  GL_BOILERPLATE;

  GLint id = Nan::To<int32_t>(info[0]).ToChecked();

  GLint infoLogLength;
  (inst->glGetShaderiv)(id, GL_INFO_LOG_LENGTH, &infoLogLength);

  char* error = new char[infoLogLength+1];
  (inst->glGetShaderInfoLog)(id, infoLogLength+1, &infoLogLength, error);

  info.GetReturnValue().Set(
    Nan::New<v8::String>(error).ToLocalChecked());

  delete[] error;
}


GL_METHOD(CreateProgram) {
  GL_BOILERPLATE;

  GLuint program=(inst->glCreateProgram)();
  inst->registerGLObj(GLOBJECT_TYPE_PROGRAM, program);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(program));
}


GL_METHOD(AttachShader) {
  GL_BOILERPLATE;

  GLint program = Nan::To<int32_t>(info[0]).ToChecked();
  GLint shader  = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glAttachShader)(program, shader);
}

GL_METHOD(ValidateProgram) {
  GL_BOILERPLATE;

  (inst->glValidateProgram)(Nan::To<int32_t>(info[0]).ToChecked());
}

GL_METHOD(LinkProgram) {
  GL_BOILERPLATE;

  (inst->glLinkProgram)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(GetProgramParameter) {
  GL_BOILERPLATE;

  GLint program = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname  = (GLenum)(Nan::To<int32_t>(info[1]).ToChecked());
  GLint value = 0;

  (inst->glGetProgramiv)(program, pname, &value);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(value));
}


GL_METHOD(GetUniformLocation) {
  GL_BOILERPLATE;

  GLint program = Nan::To<int32_t>(info[0]).ToChecked();
  Nan::Utf8String name(info[1]);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(
    (inst->glGetUniformLocation)(program, *name)));
}


GL_METHOD(ClearColor) {
  GL_BOILERPLATE;

  GLfloat red   = static_cast<GLfloat>(Nan::To<double>(info[0]).ToChecked());
  GLfloat green = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat blue  = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());
  GLfloat alpha = static_cast<GLfloat>(Nan::To<double>(info[3]).ToChecked());

  (inst->glClearColor)(red, green, blue, alpha);
}


GL_METHOD(ClearDepth) {
  GL_BOILERPLATE;

  GLfloat depth = static_cast<GLfloat>(Nan::To<double>(info[0]).ToChecked());

  (inst->glClearDepthf)(depth);
}

GL_METHOD(Disable) {
  GL_BOILERPLATE;

  (inst->glDisable)(Nan::To<int32_t>(info[0]).ToChecked());
}

GL_METHOD(Enable) {
  GL_BOILERPLATE;

  (inst->glEnable)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(CreateTexture) {
  GL_BOILERPLATE;

  GLuint texture;
  (inst->glGenTextures)(1, &texture);
  inst->registerGLObj(GLOBJECT_TYPE_TEXTURE, texture);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(texture));
}


GL_METHOD(BindTexture) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLint texture = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glBindTexture)(target, texture);
}

unsigned char* WebGLRenderingContext::unpackPixels(
  GLenum type,
  GLenum format,
  GLint width,
  GLint height,
  unsigned char* pixels) {

  //Compute pixel size
  GLint pixelSize = 1;
  if(type == GL_UNSIGNED_BYTE || type == GL_FLOAT) {
    if(type == GL_FLOAT) {
      pixelSize = 4;
    }
    switch(format) {
      case GL_ALPHA:
      case GL_LUMINANCE:
      break;
      case GL_LUMINANCE_ALPHA:
        pixelSize *= 2;
      break;
      case GL_RGB:
        pixelSize *= 3;
      break;
      case GL_RGBA:
        pixelSize *= 4;
      break;
    }
  } else {
    pixelSize = 2;
  }

  //Compute row stride
  GLint rowStride = pixelSize * width;
  if((rowStride % unpack_alignment) != 0) {
    rowStride += unpack_alignment - (rowStride % unpack_alignment);
  }

  GLint imageSize = rowStride * height;
  unsigned char* unpacked = new unsigned char[imageSize];

  if(unpack_flip_y) {
    for(int i=0,j=height-1; j>=0; ++i, --j) {
      memcpy(
          reinterpret_cast<void*>(unpacked + j*rowStride)
        , reinterpret_cast<void*>(pixels   + i*rowStride)
        , width * pixelSize);
    }
  } else {
    memcpy(
        reinterpret_cast<void*>(unpacked)
      , reinterpret_cast<void*>(pixels)
      , imageSize);
  }

  //Premultiply alpha unpacking
  if(unpack_premultiply_alpha &&
     (format == GL_LUMINANCE_ALPHA ||
      format == GL_RGBA)) {

    for(int row=0; row<height; ++row) {
      for(int col=0; col<width; ++col) {
        unsigned char* pixel = unpacked + (row * rowStride) + (col * pixelSize);
        if(format == GL_LUMINANCE_ALPHA) {
          pixel[0] *= pixel[1] / 255.0;
        } else if(type == GL_UNSIGNED_BYTE) {
          float scale = pixel[3] / 255.0;
          pixel[0] *= scale;
          pixel[1] *= scale;
          pixel[2] *= scale;
        } else if(type == GL_UNSIGNED_SHORT_4_4_4_4) {
          int r = pixel[0]&0x0f;
          int g = pixel[0]>>4;
          int b = pixel[1]&0x0f;
          int a = pixel[1]>>4;

          float scale = a / 15.0;
          r *= scale;
          g *= scale;
          b *= scale;

          pixel[0] = r + (g<<4);
          pixel[1] = b + (a<<4);
        } else if(type == GL_UNSIGNED_SHORT_5_5_5_1) {
          if((pixel[0]&1) == 0) {
            pixel[0] = 1; //why does this get set to 1?!?!?!
            pixel[1] = 0;
          }
        }
      }
    }
  }

  return unpacked;
}

GL_METHOD(TexImage2D) {
  GL_BOILERPLATE;

  GLenum target         = Nan::To<int32_t>(info[0]).ToChecked();
  GLint level           = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum internalformat = Nan::To<int32_t>(info[2]).ToChecked();
  GLsizei width         = Nan::To<int32_t>(info[3]).ToChecked();
  GLsizei height        = Nan::To<int32_t>(info[4]).ToChecked();
  GLint border          = Nan::To<int32_t>(info[5]).ToChecked();
  GLenum format         = Nan::To<int32_t>(info[6]).ToChecked();
  GLint type            = Nan::To<int32_t>(info[7]).ToChecked();
  Nan::TypedArrayContents<unsigned char> pixels(info[8]);

  if(*pixels) {
    if(inst->unpack_flip_y || inst->unpack_premultiply_alpha) {
      unsigned char* unpacked = inst->unpackPixels(
          type
        , format
        , width
        , height
        , *pixels);
      (inst->glTexImage2D)(
          target
        , level
        , internalformat
        , width
        , height
        , border
        , format
        , type
        , unpacked);
      delete[] unpacked;
    } else {
      (inst->glTexImage2D)(
          target
        , level
        , internalformat
        , width
        , height
        , border
        , format
        , type
        , *pixels);
    }
  } else {
    size_t length = width * height * 4;
    if(type == GL_FLOAT) {
      length *= 4;
    }
    char* data = new char[length];
    memset(data, 0, length);
    (inst->glTexImage2D)(
        target
      , level
      , internalformat
      , width
      , height
      , border
      , format
      , type
      , data);
    delete[] data;
  }
}

GL_METHOD(TexSubImage2D) {
  GL_BOILERPLATE;

  GLenum target   = Nan::To<int32_t>(info[0]).ToChecked();
  GLint level     = Nan::To<int32_t>(info[1]).ToChecked();
  GLint xoffset   = Nan::To<int32_t>(info[2]).ToChecked();
  GLint yoffset   = Nan::To<int32_t>(info[3]).ToChecked();
  GLsizei width   = Nan::To<int32_t>(info[4]).ToChecked();
  GLsizei height  = Nan::To<int32_t>(info[5]).ToChecked();
  GLenum format   = Nan::To<int32_t>(info[6]).ToChecked();
  GLenum type     = Nan::To<int32_t>(info[7]).ToChecked();
  Nan::TypedArrayContents<unsigned char> pixels(info[8]);

  if(inst->unpack_flip_y ||
     inst->unpack_premultiply_alpha) {
    unsigned char* unpacked = inst->unpackPixels(
        type
      , format
      , width
      , height
      , *pixels);
    (inst->glTexSubImage2D)(
        target
      , level
      , xoffset
      , yoffset
      , width
      , height
      , format
      , type
      , unpacked);
    delete[] unpacked;
  } else {
    (inst->glTexSubImage2D)(
        target
      , level
      , xoffset
      , yoffset
      , width
      , height
      , format
      , type
      , *pixels);
  }
}



GL_METHOD(TexParameteri) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname  = Nan::To<int32_t>(info[1]).ToChecked();
  GLint param   = Nan::To<int32_t>(info[2]).ToChecked();

  (inst->glTexParameteri)(target, pname, param);
}

GL_METHOD(TexParameterf) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname  = Nan::To<int32_t>(info[1]).ToChecked();
  GLfloat param = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());

  (inst->glTexParameterf)(target, pname, param);
}


GL_METHOD(Clear) {
  GL_BOILERPLATE;

  (inst->glClear)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(UseProgram) {
  GL_BOILERPLATE;

  (inst->glUseProgram)(Nan::To<int32_t>(info[0]).ToChecked());
}

GL_METHOD(CreateBuffer) {
  GL_BOILERPLATE;

  GLuint buffer;
  (inst->glGenBuffers)(1, &buffer);
  inst->registerGLObj(GLOBJECT_TYPE_BUFFER, buffer);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(buffer));
}

GL_METHOD(BindBuffer) {
  GL_BOILERPLATE;

  GLenum target = (GLenum)Nan::To<int32_t>(info[0]).ToChecked();
  GLuint buffer = (GLuint)Nan::To<uint32_t>(info[1]).ToChecked();

  (inst->glBindBuffer)(target,buffer);
}


GL_METHOD(CreateFramebuffer) {
  GL_BOILERPLATE;

  GLuint buffer;
  (inst->glGenFramebuffers)(1, &buffer);
  inst->registerGLObj(GLOBJECT_TYPE_FRAMEBUFFER, buffer);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(buffer));
}


GL_METHOD(BindFramebuffer) {
  GL_BOILERPLATE;

  GLint target = (GLint)Nan::To<int32_t>(info[0]).ToChecked();
  GLint buffer = (GLint)(Nan::To<int32_t>(info[1]).ToChecked());

  (inst->glBindFramebuffer)(target, buffer);
}


GL_METHOD(FramebufferTexture2D) {
  GL_BOILERPLATE;

  GLenum target     = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum attachment = Nan::To<int32_t>(info[1]).ToChecked();
  GLint textarget   = Nan::To<int32_t>(info[2]).ToChecked();
  GLint texture     = Nan::To<int32_t>(info[3]).ToChecked();
  GLint level       = Nan::To<int32_t>(info[4]).ToChecked();

  // Handle depth stencil case separately
  if(attachment == 0x821A) {
    (inst->glFramebufferTexture2D)(
        target
      , GL_DEPTH_ATTACHMENT
      , textarget
      , texture
      , level);
    (inst->glFramebufferTexture2D)(
        target
      , GL_STENCIL_ATTACHMENT
      , textarget
      , texture
      , level);
  } else {
    (inst->glFramebufferTexture2D)(
        target
      , attachment
      , textarget
      , texture
      , level);
  }
}


GL_METHOD(BufferData) {
  GL_BOILERPLATE;

  GLint target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum usage = Nan::To<int32_t>(info[2]).ToChecked();

  if(info[1]->IsObject()) {
    Nan::TypedArrayContents<char> array(info[1]);
    (inst->glBufferData)(target, array.length(), static_cast<void*>(*array), usage);
  } else if(info[1]->IsNumber()) {
    (inst->glBufferData)(target, Nan::To<int32_t>(info[1]).ToChecked(), NULL, usage);
  }
}


GL_METHOD(BufferSubData) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLint offset  = Nan::To<int32_t>(info[1]).ToChecked();
  Nan::TypedArrayContents<char> array(info[2]);

  (inst->glBufferSubData)(target, offset, array.length(), *array);
}


GL_METHOD(BlendEquation) {
  GL_BOILERPLATE;

  GLenum mode = Nan::To<int32_t>(info[0]).ToChecked();

  (inst->glBlendEquation)(mode);
}


GL_METHOD(BlendFunc) {
  GL_BOILERPLATE;

  GLenum sfactor = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum dfactor = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glBlendFunc)(sfactor,dfactor);
}


GL_METHOD(EnableVertexAttribArray) {
  GL_BOILERPLATE;

  (inst->glEnableVertexAttribArray)(Nan::To<int32_t>(info[0]).ToChecked());
}

GL_METHOD(VertexAttribPointer) {
  GL_BOILERPLATE;

  GLint index          = Nan::To<int32_t>(info[0]).ToChecked();
  GLint size           = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum type          = Nan::To<int32_t>(info[2]).ToChecked();
  GLboolean normalized = Nan::To<bool>(info[3]).ToChecked();
  GLint stride         = Nan::To<int32_t>(info[4]).ToChecked();
  size_t offset        = Nan::To<uint32_t>(info[5]).ToChecked();

  (inst->glVertexAttribPointer)(
    index,
    size,
    type,
    normalized,
    stride,
    reinterpret_cast<GLvoid*>(offset));
}


GL_METHOD(ActiveTexture) {
  GL_BOILERPLATE;

  (inst->glActiveTexture)(Nan::To<int32_t>(info[0]).ToChecked());
}


GL_METHOD(DrawElements) {
  GL_BOILERPLATE;

  GLenum mode   = Nan::To<int32_t>(info[0]).ToChecked();
  GLint count   = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum type   = Nan::To<int32_t>(info[2]).ToChecked();
  size_t offset = Nan::To<uint32_t>(info[3]).ToChecked();

  (inst->glDrawElements)(mode, count, type, reinterpret_cast<GLvoid*>(offset));
}


GL_METHOD(Flush) {
  GL_BOILERPLATE;

  (inst->glFlush)();
}

GL_METHOD(Finish) {
  GL_BOILERPLATE;

  (inst->glFinish)();
}

GL_METHOD(VertexAttrib1f) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());

  (inst->glVertexAttrib1f)(index, x);
}

GL_METHOD(VertexAttrib2f) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());

  (inst->glVertexAttrib2f)(index, x, y);
}

GL_METHOD(VertexAttrib3f) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());
  GLfloat z = static_cast<GLfloat>(Nan::To<double>(info[3]).ToChecked());

  (inst->glVertexAttrib3f)(index, x, y, z);
}

GL_METHOD(VertexAttrib4f) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<int32_t>(info[0]).ToChecked();
  GLfloat x = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());
  GLfloat y = static_cast<GLfloat>(Nan::To<double>(info[2]).ToChecked());
  GLfloat z = static_cast<GLfloat>(Nan::To<double>(info[3]).ToChecked());
  GLfloat w = static_cast<GLfloat>(Nan::To<double>(info[4]).ToChecked());

  (inst->glVertexAttrib4f)(index, x, y, z, w);
}

GL_METHOD(BlendColor) {
  GL_BOILERPLATE;

  GLclampf r = static_cast<GLclampf>(Nan::To<double>(info[0]).ToChecked());
  GLclampf g = static_cast<GLclampf>(Nan::To<double>(info[1]).ToChecked());
  GLclampf b = static_cast<GLclampf>(Nan::To<double>(info[2]).ToChecked());
  GLclampf a = static_cast<GLclampf>(Nan::To<double>(info[3]).ToChecked());

  (inst->glBlendColor)(r, g, b, a);
}

GL_METHOD(BlendEquationSeparate) {
  GL_BOILERPLATE;

  GLenum mode_rgb   = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum mode_alpha = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glBlendEquationSeparate)(mode_rgb, mode_alpha);
}

GL_METHOD(BlendFuncSeparate) {
  GL_BOILERPLATE;

  GLenum src_rgb   = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum dst_rgb   = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum src_alpha = Nan::To<int32_t>(info[2]).ToChecked();
  GLenum dst_alpha = Nan::To<int32_t>(info[3]).ToChecked();

  (inst->glBlendFuncSeparate)(src_rgb, dst_rgb, src_alpha, dst_alpha);
}

GL_METHOD(ClearStencil) {
  GL_BOILERPLATE;

  GLint s = Nan::To<int32_t>(info[0]).ToChecked();

  (inst->glClearStencil)(s);
}

GL_METHOD(ColorMask) {
  GL_BOILERPLATE;

  GLboolean r = (Nan::To<bool>(info[0]).ToChecked());
  GLboolean g = (Nan::To<bool>(info[1]).ToChecked());
  GLboolean b = (Nan::To<bool>(info[2]).ToChecked());
  GLboolean a = (Nan::To<bool>(info[3]).ToChecked());

  (inst->glColorMask)(r, g, b, a);
}

GL_METHOD(CopyTexImage2D) {
  GL_BOILERPLATE;

  GLenum target         = Nan::To<int32_t>(info[0]).ToChecked();
  GLint level           = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum internalformat = Nan::To<int32_t>(info[2]).ToChecked();
  GLint x               = Nan::To<int32_t>(info[3]).ToChecked();
  GLint y               = Nan::To<int32_t>(info[4]).ToChecked();
  GLsizei width         = Nan::To<int32_t>(info[5]).ToChecked();
  GLsizei height        = Nan::To<int32_t>(info[6]).ToChecked();
  GLint border          = Nan::To<int32_t>(info[7]).ToChecked();

  (inst->glCopyTexImage2D)(target, level, internalformat, x, y, width, height, border);
}

GL_METHOD(CopyTexSubImage2D) {
  GL_BOILERPLATE;

  GLenum target  = Nan::To<int32_t>(info[0]).ToChecked();
  GLint level    = Nan::To<int32_t>(info[1]).ToChecked();
  GLint xoffset  = Nan::To<int32_t>(info[2]).ToChecked();
  GLint yoffset  = Nan::To<int32_t>(info[3]).ToChecked();
  GLint x        = Nan::To<int32_t>(info[4]).ToChecked();
  GLint y        = Nan::To<int32_t>(info[5]).ToChecked();
  GLsizei width  = Nan::To<int32_t>(info[6]).ToChecked();
  GLsizei height = Nan::To<int32_t>(info[7]).ToChecked();

  (inst->glCopyTexSubImage2D)(target, level, xoffset, yoffset, x, y, width, height);
}

GL_METHOD(CullFace) {
  GL_BOILERPLATE;

  GLenum mode = Nan::To<int32_t>(info[0]).ToChecked();

  (inst->glCullFace)(mode);
}

GL_METHOD(DepthMask) {
  GL_BOILERPLATE;

  GLboolean flag = (Nan::To<bool>(info[0]).ToChecked());

  (inst->glDepthMask)(flag);
}

GL_METHOD(DepthRange) {
  GL_BOILERPLATE;

  GLclampf zNear  = static_cast<GLclampf>(Nan::To<double>(info[0]).ToChecked());
  GLclampf zFar   = static_cast<GLclampf>(Nan::To<double>(info[1]).ToChecked());

  (inst->glDepthRangef)(zNear, zFar);
}

GL_METHOD(DisableVertexAttribArray) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<int32_t>(info[0]).ToChecked();

  (inst->glDisableVertexAttribArray)(index);
}

GL_METHOD(Hint) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum mode   = Nan::To<int32_t>(info[1]).ToChecked();

  (inst->glHint)(target, mode);
}

GL_METHOD(IsEnabled) {
  GL_BOILERPLATE;

  GLenum cap = Nan::To<int32_t>(info[0]).ToChecked();
  bool ret = (inst->glIsEnabled)(cap) != 0;

  info.GetReturnValue().Set(Nan::New<v8::Boolean>(ret));
}

GL_METHOD(LineWidth) {
  GL_BOILERPLATE;

  GLfloat width = (GLfloat)(Nan::To<double>(info[0]).ToChecked());

  (inst->glLineWidth)(width);
}

GL_METHOD(PolygonOffset) {
  GL_BOILERPLATE;

  GLfloat factor  = static_cast<GLfloat>(Nan::To<double>(info[0]).ToChecked());
  GLfloat units   = static_cast<GLfloat>(Nan::To<double>(info[1]).ToChecked());

  (inst->glPolygonOffset)(factor, units);
}

GL_METHOD(SampleCoverage) {
  GL_BOILERPLATE;

  GLclampf value   = static_cast<GLclampf>(Nan::To<double>(info[0]).ToChecked());
  GLboolean invert = (Nan::To<bool>(info[1]).ToChecked());

  (inst->glSampleCoverage)(value, invert);
}

GL_METHOD(Scissor) {
  GL_BOILERPLATE;

  GLint x        = Nan::To<int32_t>(info[0]).ToChecked();
  GLint y        = Nan::To<int32_t>(info[1]).ToChecked();
  GLsizei width  = Nan::To<int32_t>(info[2]).ToChecked();
  GLsizei height = Nan::To<int32_t>(info[3]).ToChecked();

  (inst->glScissor)(x, y, width, height);
}

GL_METHOD(StencilFunc) {
  GL_BOILERPLATE;

  GLenum func = Nan::To<int32_t>(info[0]).ToChecked();
  GLint ref   = Nan::To<int32_t>(info[1]).ToChecked();
  GLuint mask = Nan::To<uint32_t>(info[2]).ToChecked();

  (inst->glStencilFunc)(func, ref, mask);
}

GL_METHOD(StencilFuncSeparate) {
  GL_BOILERPLATE;

  GLenum face = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum func = Nan::To<int32_t>(info[1]).ToChecked();
  GLint ref   = Nan::To<int32_t>(info[2]).ToChecked();
  GLuint mask = Nan::To<uint32_t>(info[3]).ToChecked();

  (inst->glStencilFuncSeparate)(face, func, ref, mask);
}

GL_METHOD(StencilMask) {
  GL_BOILERPLATE;

  GLuint mask = Nan::To<uint32_t>(info[0]).ToChecked();

  (inst->glStencilMask)(mask);
}

GL_METHOD(StencilMaskSeparate) {
  GL_BOILERPLATE;

  GLenum face = Nan::To<int32_t>(info[0]).ToChecked();
  GLuint mask = Nan::To<uint32_t>(info[1]).ToChecked();

  (inst->glStencilMaskSeparate)(face, mask);
}

GL_METHOD(StencilOp) {
  GL_BOILERPLATE;

  GLenum fail   = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum zfail  = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum zpass  = Nan::To<int32_t>(info[2]).ToChecked();

  (inst->glStencilOp)(fail, zfail, zpass);
}

GL_METHOD(StencilOpSeparate) {
  GL_BOILERPLATE;

  GLenum face   = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum fail   = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum zfail  = Nan::To<int32_t>(info[2]).ToChecked();
  GLenum zpass  = Nan::To<int32_t>(info[3]).ToChecked();

  (inst->glStencilOpSeparate)(face, fail, zfail, zpass);
}

GL_METHOD(BindRenderbuffer) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLuint buffer = Nan::To<uint32_t>(info[1]).ToChecked();

  (inst->glBindRenderbuffer)(target, buffer);
}

GL_METHOD(CreateRenderbuffer) {
  GL_BOILERPLATE;

  GLuint renderbuffers;
  (inst->glGenRenderbuffers)(1, &renderbuffers);

  inst->registerGLObj(GLOBJECT_TYPE_RENDERBUFFER, renderbuffers);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(renderbuffers));
}

GL_METHOD(DeleteBuffer) {
  GL_BOILERPLATE;

  GLuint buffer = (GLuint)Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_BUFFER, buffer);

  (inst->glDeleteBuffers)(1, &buffer);
}

GL_METHOD(DeleteFramebuffer) {
  GL_BOILERPLATE;

  GLuint buffer = Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_FRAMEBUFFER, buffer);

  (inst->glDeleteFramebuffers)(1, &buffer);
}

GL_METHOD(DeleteProgram) {
  GL_BOILERPLATE;

  GLuint program = Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_PROGRAM, program);

  (inst->glDeleteProgram)(program);
}

GL_METHOD(DeleteRenderbuffer) {
  GL_BOILERPLATE;

  GLuint renderbuffer = Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_RENDERBUFFER, renderbuffer);

  (inst->glDeleteRenderbuffers)(1, &renderbuffer);
}

GL_METHOD(DeleteShader) {
  GL_BOILERPLATE;

  GLuint shader = Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_SHADER, shader);

  (inst->glDeleteShader)(shader);
}

GL_METHOD(DeleteTexture) {
  GL_BOILERPLATE;

  GLuint texture = Nan::To<uint32_t>(info[0]).ToChecked();

  inst->unregisterGLObj(GLOBJECT_TYPE_TEXTURE, texture);

  (inst->glDeleteTextures)(1, &texture);
}

GL_METHOD(DetachShader) {
  GL_BOILERPLATE;

  GLuint program  = Nan::To<uint32_t>(info[0]).ToChecked();
  GLuint shader   = Nan::To<uint32_t>(info[1]).ToChecked();

  (inst->glDetachShader)(program, shader);
}

GL_METHOD(FramebufferRenderbuffer) {
  GL_BOILERPLATE;

  GLenum target             = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum attachment         = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum renderbuffertarget = Nan::To<int32_t>(info[2]).ToChecked();
  GLuint renderbuffer       = Nan::To<uint32_t>(info[3]).ToChecked();

  // Handle depth stencil case separately
  if(attachment == 0x821A) {
    (inst->glFramebufferRenderbuffer)(
        target
      , GL_DEPTH_ATTACHMENT
      , renderbuffertarget
      , renderbuffer);
    (inst->glFramebufferRenderbuffer)(
        target
      , GL_STENCIL_ATTACHMENT
      , renderbuffertarget
      , renderbuffer);
  } else {
    (inst->glFramebufferRenderbuffer)(
        target
      , attachment
      , renderbuffertarget
      , renderbuffer);
  }
}

GL_METHOD(GetVertexAttribOffset) {
  GL_BOILERPLATE;

  GLuint index = Nan::To<uint32_t>(info[0]).ToChecked();
  GLenum pname = Nan::To<int32_t>(info[1]).ToChecked();

  void *ret = NULL;
  (inst->glGetVertexAttribPointerv)(index, pname, &ret);

  GLuint offset = static_cast<GLuint>(reinterpret_cast<size_t>(ret));
  info.GetReturnValue().Set(Nan::New<v8::Integer>(offset));
}

GL_METHOD(IsBuffer) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsBuffer)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(IsFramebuffer) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsFramebuffer)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(IsProgram) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsProgram)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(IsRenderbuffer) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsRenderbuffer)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(IsShader) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsShader)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(IsTexture) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(
      (inst->glIsTexture)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}

GL_METHOD(RenderbufferStorage) {
  GL_BOILERPLATE;

  GLenum target         = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum internalformat = Nan::To<int32_t>(info[1]).ToChecked();
  GLsizei width         = Nan::To<int32_t>(info[2]).ToChecked();
  GLsizei height        = Nan::To<int32_t>(info[3]).ToChecked();

  //In WebGL, we map GL_DEPTH_STENCIL to GL_DEPTH24_STENCIL8
  if (internalformat == GL_DEPTH_STENCIL_OES) {
    internalformat = GL_DEPTH24_STENCIL8_OES;
  } else if (internalformat == GL_DEPTH_COMPONENT32_OES) {
    internalformat = inst->preferredDepth;
  }

  (inst->glRenderbufferStorage)(target, internalformat, width, height);
}

GL_METHOD(GetShaderSource) {
  GL_BOILERPLATE;

  GLint shader = Nan::To<int32_t>(info[0]).ToChecked();

  GLint len;
  (inst->glGetShaderiv)(shader, GL_SHADER_SOURCE_LENGTH, &len);

  GLchar *source = new GLchar[len];
  (inst->glGetShaderSource)(shader, len, NULL, source);
  v8::Local<v8::String> str = Nan::New<v8::String>(source).ToLocalChecked();
  delete[] source;

  info.GetReturnValue().Set(str);
}

GL_METHOD(ReadPixels) {
  GL_BOILERPLATE;

  GLint x        = Nan::To<int32_t>(info[0]).ToChecked();
  GLint y        = Nan::To<int32_t>(info[1]).ToChecked();
  GLsizei width  = Nan::To<int32_t>(info[2]).ToChecked();
  GLsizei height = Nan::To<int32_t>(info[3]).ToChecked();
  GLenum format  = Nan::To<int32_t>(info[4]).ToChecked();
  GLenum type    = Nan::To<int32_t>(info[5]).ToChecked();
  Nan::TypedArrayContents<char> pixels(info[6]);

  (inst->glReadPixels)(x, y, width, height, format, type, *pixels);
}

GL_METHOD(GetTexParameter) {
  GL_BOILERPLATE;

  GLenum target     = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname      = Nan::To<int32_t>(info[1]).ToChecked();
  
  if (pname == GL_TEXTURE_MAX_ANISOTROPY_EXT) {
    GLfloat param_value = 0;
    (inst->glGetTexParameterfv)(target, pname, &param_value);
    info.GetReturnValue().Set(Nan::New<v8::Number>(param_value));
  } else {
    GLint param_value = 0;
    (inst->glGetTexParameteriv)(target, pname, &param_value);
    info.GetReturnValue().Set(Nan::New<v8::Integer>(param_value));
  }
}

GL_METHOD(GetActiveAttrib) {
  GL_BOILERPLATE;

  GLuint program = Nan::To<int32_t>(info[0]).ToChecked();
  GLuint index   = Nan::To<int32_t>(info[1]).ToChecked();

  GLint maxLength;
  (inst->glGetProgramiv)(program, GL_ACTIVE_ATTRIBUTE_MAX_LENGTH, &maxLength);

  char* name = new char[maxLength];
  GLsizei length = 0;
  GLenum  type;
  GLsizei size;
  (inst->glGetActiveAttrib)(program, index, maxLength, &length, &size, &type, name);

  if (length > 0) {
    v8::Local<v8::Object> activeInfo = Nan::New<v8::Object>();
    Nan::Set(activeInfo
      , Nan::New<v8::String>("size").ToLocalChecked()
      , Nan::New<v8::Integer>(size));
    Nan::Set(activeInfo
      , Nan::New<v8::String>("type").ToLocalChecked()
      , Nan::New<v8::Integer>(type));
    Nan::Set(activeInfo
      , Nan::New<v8::String>("name").ToLocalChecked()
      , Nan::New<v8::String>(name).ToLocalChecked());
    info.GetReturnValue().Set(activeInfo);
  } else {
    info.GetReturnValue().SetNull();
  }

  delete[] name;
}

GL_METHOD(GetActiveUniform) {
  GL_BOILERPLATE;

  GLuint program = Nan::To<int32_t>(info[0]).ToChecked();
  GLuint index   = Nan::To<int32_t>(info[1]).ToChecked();

  GLint maxLength;
  (inst->glGetProgramiv)(program, GL_ACTIVE_UNIFORM_MAX_LENGTH, &maxLength);


  char* name = new char[maxLength];
  GLsizei length = 0;
  GLenum  type;
  GLsizei size;
  (inst->glGetActiveUniform)(program, index, maxLength, &length, &size, &type, name);

  if (length > 0) {
    v8::Local<v8::Object> activeInfo = Nan::New<v8::Object>();
    Nan::Set(activeInfo
      , Nan::New<v8::String>("size").ToLocalChecked()
      , Nan::New<v8::Integer>(size));
    Nan::Set(activeInfo
      , Nan::New<v8::String>("type").ToLocalChecked()
      , Nan::New<v8::Integer>(type));
    Nan::Set(activeInfo
      , Nan::New<v8::String>("name").ToLocalChecked()
      , Nan::New<v8::String>(name).ToLocalChecked());
    info.GetReturnValue().Set(activeInfo);
  } else {
    info.GetReturnValue().SetNull();
  }

  delete[] name;
}

GL_METHOD(GetAttachedShaders) {
  GL_BOILERPLATE;

  GLuint program = Nan::To<int32_t>(info[0]).ToChecked();

  GLint numAttachedShaders;
  (inst->glGetProgramiv)(program, GL_ATTACHED_SHADERS, &numAttachedShaders);

  GLuint* shaders = new GLuint[numAttachedShaders];
  GLsizei count;
  (inst->glGetAttachedShaders)(program, numAttachedShaders, &count, shaders);

  v8::Local<v8::Array> shadersArr = Nan::New<v8::Array>(count);
  for (int i=0; i<count; i++) {
    Nan::Set(shadersArr, i, Nan::New<v8::Integer>((int)shaders[i]));
  }

  info.GetReturnValue().Set(shadersArr);

  delete[] shaders;
}

GL_METHOD(GetParameter) {
  GL_BOILERPLATE;
  GLenum name = Nan::To<int32_t>(info[0]).ToChecked();

  switch(name) {
    case 0x9240 /* UNPACK_FLIP_Y_WEBGL */:
      info.GetReturnValue().Set(
        Nan::New<v8::Boolean>(inst->unpack_flip_y));
    return;

    case 0x9241 /* UNPACK_PREMULTIPLY_ALPHA_WEBGL*/:
      info.GetReturnValue().Set(
        Nan::New<v8::Boolean>(inst->unpack_premultiply_alpha));
    return;

    case 0x9243 /* UNPACK_COLORSPACE_CONVERSION_WEBGL */:
      info.GetReturnValue().Set(
        Nan::New<v8::Integer>(inst->unpack_colorspace_conversion));
    return;

    case GL_BLEND:
    case GL_CULL_FACE:
    case GL_DEPTH_TEST:
    case GL_DEPTH_WRITEMASK:
    case GL_DITHER:
    case GL_POLYGON_OFFSET_FILL:
    case GL_SAMPLE_COVERAGE_INVERT:
    case GL_SCISSOR_TEST:
    case GL_STENCIL_TEST:
    {
      GLboolean params;
      (inst->glGetBooleanv)(name, &params);

      info.GetReturnValue().Set(Nan::New<v8::Boolean>(params != 0));

      return;
    }

    case GL_DEPTH_CLEAR_VALUE:
    case GL_LINE_WIDTH:
    case GL_POLYGON_OFFSET_FACTOR:
    case GL_POLYGON_OFFSET_UNITS:
    case GL_SAMPLE_COVERAGE_VALUE:
    case GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT:
    {
      GLfloat params;
      (inst->glGetFloatv)(name, &params);

      info.GetReturnValue().Set(Nan::New<v8::Number>(params));

      return;
    }

    case GL_RENDERER:
    case GL_SHADING_LANGUAGE_VERSION:
    case GL_VENDOR:
    case GL_VERSION:
    case GL_EXTENSIONS:
    {
      const char *params = reinterpret_cast<const char*>((inst->glGetString)(name));
      if(params) {
        info.GetReturnValue().Set(
          Nan::New<v8::String>(params).ToLocalChecked());
      }
      return;
    }

    case GL_MAX_VIEWPORT_DIMS:
    {
      GLint params[2];
      (inst->glGetIntegerv)(name, params);

      v8::Local<v8::Array> arr = Nan::New<v8::Array>(2);
      Nan::Set(arr, 0, Nan::New<v8::Integer>(params[0]));
      Nan::Set(arr, 1, Nan::New<v8::Integer>(params[1]));
      info.GetReturnValue().Set(arr);

      return;
    }

    case GL_SCISSOR_BOX:
    case GL_VIEWPORT:
    {
      GLint params[4];
      (inst->glGetIntegerv)(name, params);

      v8::Local<v8::Array> arr=Nan::New<v8::Array>(4);
      Nan::Set(arr, 0, Nan::New<v8::Integer>(params[0]));
      Nan::Set(arr, 1, Nan::New<v8::Integer>(params[1]));
      Nan::Set(arr, 2, Nan::New<v8::Integer>(params[2]));
      Nan::Set(arr, 3, Nan::New<v8::Integer>(params[3]));
      info.GetReturnValue().Set(arr);

      return;
    }

    case GL_ALIASED_LINE_WIDTH_RANGE:
    case GL_ALIASED_POINT_SIZE_RANGE:
    case GL_DEPTH_RANGE:
    {
      GLfloat params[2];
      (inst->glGetFloatv)(name, params);

      v8::Local<v8::Array> arr=Nan::New<v8::Array>(2);
      Nan::Set(arr, 0, Nan::New<v8::Number>(params[0]));
      Nan::Set(arr, 1, Nan::New<v8::Number>(params[1]));
      info.GetReturnValue().Set(arr);

      return;
    }

    case GL_BLEND_COLOR:
    case GL_COLOR_CLEAR_VALUE:
    {
      GLfloat params[4];
      (inst->glGetFloatv)(name, params);

      v8::Local<v8::Array> arr = Nan::New<v8::Array>(4);
      Nan::Set(arr, 0, Nan::New<v8::Number>(params[0]));
      Nan::Set(arr, 1, Nan::New<v8::Number>(params[1]));
      Nan::Set(arr, 2, Nan::New<v8::Number>(params[2]));
      Nan::Set(arr, 3, Nan::New<v8::Number>(params[3]));
      info.GetReturnValue().Set(arr);

      return;
    }

    case GL_COLOR_WRITEMASK:
    {
      GLboolean params[4];
      (inst->glGetBooleanv)(name, params);

      v8::Local<v8::Array> arr = Nan::New<v8::Array>(4);
      Nan::Set(arr, 0, Nan::New<v8::Boolean>(params[0] == GL_TRUE));
      Nan::Set(arr, 1, Nan::New<v8::Boolean>(params[1] == GL_TRUE));
      Nan::Set(arr, 2, Nan::New<v8::Boolean>(params[2] == GL_TRUE));
      Nan::Set(arr, 3, Nan::New<v8::Boolean>(params[3] == GL_TRUE));
      info.GetReturnValue().Set(arr);

      return;
    }

    default:
    {
      GLint params;
      (inst->glGetIntegerv)(name, &params);
      info.GetReturnValue().Set(Nan::New<v8::Integer>(params));
      return;
    }
  }
}

GL_METHOD(GetBufferParameter) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname  = Nan::To<int32_t>(info[1]).ToChecked();

  GLint params;
  (inst->glGetBufferParameteriv)(target, pname, &params);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(params));
}

GL_METHOD(GetFramebufferAttachmentParameter) {
  GL_BOILERPLATE;

  GLenum target     = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum attachment = Nan::To<int32_t>(info[1]).ToChecked();
  GLenum pname      = Nan::To<int32_t>(info[2]).ToChecked();

  GLint params;
  (inst->glGetFramebufferAttachmentParameteriv)(target, attachment, pname, &params);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(params));
}

GL_METHOD(GetProgramInfoLog) {
  GL_BOILERPLATE;

  GLuint program = Nan::To<int32_t>(info[0]).ToChecked();

  GLint infoLogLength;
  (inst->glGetProgramiv)(program, GL_INFO_LOG_LENGTH, &infoLogLength);

  char* error = new char[infoLogLength+1];
  (inst->glGetProgramInfoLog)(program, infoLogLength+1, &infoLogLength, error);

  info.GetReturnValue().Set(
    Nan::New<v8::String>(error).ToLocalChecked());

  delete[] error;
}

GL_METHOD(GetShaderPrecisionFormat) {
  GL_BOILERPLATE;

  GLenum shaderType    = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum precisionType = Nan::To<int32_t>(info[1]).ToChecked();

  GLint range[2];
  GLint precision;

  (inst->glGetShaderPrecisionFormat)(shaderType, precisionType, range, &precision);

  v8::Local<v8::Object> result = Nan::New<v8::Object>();
  Nan::Set(result
    , Nan::New<v8::String>("rangeMin").ToLocalChecked()
    , Nan::New<v8::Integer>(range[0]));
  Nan::Set(result
    , Nan::New<v8::String>("rangeMax").ToLocalChecked()
    , Nan::New<v8::Integer>(range[1]));
  Nan::Set(result
    , Nan::New<v8::String>("precision").ToLocalChecked()
    , Nan::New<v8::Integer>(precision));

  info.GetReturnValue().Set(result);
}

GL_METHOD(GetRenderbufferParameter) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname  = Nan::To<int32_t>(info[1]).ToChecked();

  int value;
  (inst->glGetRenderbufferParameteriv)(target, pname, &value);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(value));
}

GL_METHOD(GetUniform) {
  GL_BOILERPLATE;

  GLint program  = Nan::To<int32_t>(info[0]).ToChecked();
  GLint location = Nan::To<int32_t>(info[1]).ToChecked();

  float data[16];
  (inst->glGetUniformfv)(program, location, data);

  v8::Local<v8::Array> arr = Nan::New<v8::Array>(16);
  for (int i=0; i<16; i++) {
    Nan::Set(arr, i, Nan::New<v8::Number>(data[i]));
  }

  info.GetReturnValue().Set(arr);
}

GL_METHOD(GetVertexAttrib) {
  GL_BOILERPLATE;

  GLint index  = Nan::To<int32_t>(info[0]).ToChecked();
  GLenum pname = Nan::To<int32_t>(info[1]).ToChecked();

  GLint value;

  switch (pname) {
    case GL_VERTEX_ATTRIB_ARRAY_ENABLED:
    case GL_VERTEX_ATTRIB_ARRAY_NORMALIZED:
    {
      (inst->glGetVertexAttribiv)(index, pname, &value);
      info.GetReturnValue().Set(Nan::New<v8::Boolean>(value != 0));
      return;
    }

    case GL_VERTEX_ATTRIB_ARRAY_SIZE:
    case GL_VERTEX_ATTRIB_ARRAY_STRIDE:
    case GL_VERTEX_ATTRIB_ARRAY_TYPE:
    {
      (inst->glGetVertexAttribiv)(index, pname, &value);
      info.GetReturnValue().Set(Nan::New<v8::Integer>(value));
      return;
    }

    case GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:
    {
      (inst->glGetVertexAttribiv)(index, pname, &value);
      info.GetReturnValue().Set(Nan::New<v8::Integer>(value));
      return;
    }

    case GL_CURRENT_VERTEX_ATTRIB:
    {
      float vextex_attribs[4];

      (inst->glGetVertexAttribfv)(index, pname, vextex_attribs);

      v8::Local<v8::Array> arr=Nan::New<v8::Array>(4);
      Nan::Set(arr, 0,
        Nan::New<v8::Number>(vextex_attribs[0]));
      Nan::Set(arr, 1,
        Nan::New<v8::Number>(vextex_attribs[1]));
      Nan::Set(arr, 2,
        Nan::New<v8::Number>(vextex_attribs[2]));
      Nan::Set(arr, 3,
        Nan::New<v8::Number>(vextex_attribs[3]));
      info.GetReturnValue().Set(arr);

      return;
    }

    default:
      inst->setError(GL_INVALID_ENUM);
  }

  info.GetReturnValue().SetNull();
}

GL_METHOD(GetSupportedExtensions) {
  GL_BOILERPLATE;

  const char *extensions = reinterpret_cast<const char*>(
    (inst->glGetString)(GL_EXTENSIONS));

  info.GetReturnValue().Set(
    Nan::New<v8::String>(extensions).ToLocalChecked());
}

GL_METHOD(GetExtension) {
  GL_BOILERPLATE;

  //TODO
}

GL_METHOD(CheckFramebufferStatus) {
  GL_BOILERPLATE;

  GLenum target = Nan::To<int32_t>(info[0]).ToChecked();

  info.GetReturnValue().Set(
    Nan::New<v8::Integer>(
      static_cast<int>((inst->glCheckFramebufferStatus)(target))));
}

GL_METHOD(DrawBuffersWEBGL) {
  GL_BOILERPLATE;

  v8::Local<v8::Array> buffersArray = v8::Local<v8::Array>::Cast(info[0]);
  GLuint numBuffers = buffersArray->Length();
  GLenum* buffers = new GLenum[numBuffers];

  for (GLuint i = 0; i < numBuffers; i++) {
    buffers[i] = Nan::Get(buffersArray, i).ToLocalChecked()->Uint32Value(Nan::GetCurrentContext()).ToChecked();
  }

  (inst->glDrawBuffersEXT)(numBuffers, buffers);

  delete[] buffers;
}

GL_METHOD(EXTWEBGL_draw_buffers) {
  v8::Local<v8::Object> result = Nan::New<v8::Object>();
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT0_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT0_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT1_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT1_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT2_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT2_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT3_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT3_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT4_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT4_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT5_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT5_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT6_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT6_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT7_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT7_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT8_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT8_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT9_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT9_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT10_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT10_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT11_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT11_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT12_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT12_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT13_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT13_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT14_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT14_EXT));
  Nan::Set(result, Nan::New("COLOR_ATTACHMENT15_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_COLOR_ATTACHMENT15_EXT));

  Nan::Set(result, Nan::New("DRAW_BUFFER0_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER0_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER1_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER1_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER2_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER2_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER3_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER3_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER4_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER4_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER5_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER5_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER6_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER6_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER7_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER7_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER8_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER8_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER9_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER9_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER10_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER10_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER11_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER11_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER12_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER12_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER13_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER13_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER14_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER14_EXT));
  Nan::Set(result, Nan::New("DRAW_BUFFER15_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_DRAW_BUFFER15_EXT));

  Nan::Set(result, Nan::New("MAX_COLOR_ATTACHMENTS_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_MAX_COLOR_ATTACHMENTS_EXT));
  Nan::Set(result, Nan::New("MAX_DRAW_BUFFERS_WEBGL").ToLocalChecked(), Nan::New<v8::Number>(GL_MAX_DRAW_BUFFERS_EXT));

  info.GetReturnValue().Set(result);
}

GL_METHOD(BindVertexArrayOES) {
  GL_BOILERPLATE;

  GLuint array = Nan::To<uint32_t>(info[0]).ToChecked();

  (inst->glBindVertexArrayOES)(array);
}

GL_METHOD(CreateVertexArrayOES) {
  GL_BOILERPLATE;

  GLuint array = 0;
  (inst->glGenVertexArraysOES)(1, &array);
  inst->registerGLObj(GLOBJECT_TYPE_VERTEX_ARRAY, array);

  info.GetReturnValue().Set(Nan::New<v8::Integer>(array));
}

GL_METHOD(DeleteVertexArrayOES) {
  GL_BOILERPLATE;

  GLuint array = Nan::To<uint32_t>(info[0]).ToChecked();
  inst->unregisterGLObj(GLOBJECT_TYPE_VERTEX_ARRAY, array);

  (inst->glDeleteVertexArraysOES)(1, &array);
}

GL_METHOD(IsVertexArrayOES) {
  GL_BOILERPLATE;

  info.GetReturnValue().Set(Nan::New<v8::Boolean>(
    (inst->glIsVertexArrayOES)(Nan::To<uint32_t>(info[0]).ToChecked()) != 0));
}
