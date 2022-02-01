'use strict'

var coallesceUniforms = require('./reflect')
var GLError = require("./GLError")

module.exports = createUniformWrapper

//Binds a function and returns a value
function identity(x) {
  return function() {
    return x
  }
}

function makeVector(length, fill) {
  var result = new Array(length)
  for(var i=0; i<length; ++i) {
    result[i] = fill
  }
  return result
}

//Create shims for uniforms
function createUniformWrapper(gl, wrapper, uniforms, locations) {

  function makeGetter(idx) {
    return function(gl, wrapper, locations) {
      return gl.getUniform(wrapper.program, locations[idx])
    }
  }

  function makeSetter(type) {
    return function updateProperty(obj){
      var indices = enumerateIndices('', type)
      for(var i=0; i<indices.length; ++i) {
        var item = indices[i]
        var path = item[0]
        var idx  = item[1]
        if(locations[idx]) {
          var objPath =  obj
          if(typeof path === 'string' && (
            path.indexOf('.') === 0 ||
            path.indexOf('[') === 0
          )) {
            var key = path
            if(path.indexOf('.') === 0) {
              key = path.slice(1)
            }

            if(key.indexOf(']') === key.length - 1) {
              var j = key.indexOf('[')
              var k1 = key.slice(0, j)
              var k2 = key.slice(j + 1, key.length - 1)
              objPath = k1? obj[k1][k2] : obj[k2]
            } else {
              objPath = obj[key]
            }
          }

          var t = uniforms[idx].type
          var d
          switch(t) {
            case 'bool':
            case 'int':
            case 'sampler2D':
            case 'samplerCube':
              gl.uniform1i(locations[idx], objPath)
              break
            case 'float':
              gl.uniform1f(locations[idx], objPath)
              break
            default:
              var vidx = t.indexOf('vec')
              if(0 <= vidx && vidx <= 1 && t.length === 4 + vidx) {
                d = t.charCodeAt(t.length-1) - 48
                if(d < 2 || d > 4) {
                  throw new GLError('', 'Invalid data type')
                }
                switch(t.charAt(0)) {
                  case 'b':
                  case 'i':
                    gl['uniform' + d + 'iv'](locations[idx], objPath)
                    break
                  case 'v':
                    gl['uniform' + d + 'fv'](locations[idx], objPath)
                    break
                  default:
                    throw new GLError('', 'Unrecognized data type for vector ' + name + ': ' + t)
                }
              } else if(t.indexOf('mat') === 0 && t.length === 4) {
                d = t.charCodeAt(t.length-1) - 48
                if(d < 2 || d > 4) {
                  throw new GLError('', 'Invalid uniform dimension type for matrix ' + name + ': ' + t)
                }
                gl['uniformMatrix' + d + 'fv'](locations[idx], false, objPath)
                break
              } else {
                throw new GLError('', 'Unknown uniform data type for ' + name + ': ' + t)
              }
          }
        }
      }
    }
  }

  function enumerateIndices(prefix, type) {
    if(typeof type !== 'object') {
      return [ [prefix, type] ]
    }
    var indices = []
    for(var id in type) {
      var prop = type[id]
      var tprefix = prefix
      if(parseInt(id) + '' === id) {
        tprefix += '[' + id + ']'
      } else {
        tprefix += '.' + id
      }
      if(typeof prop === 'object') {
        indices.push.apply(indices, enumerateIndices(tprefix, prop))
      } else {
        indices.push([tprefix, prop])
      }
    }
    return indices
  }


  function defaultValue(type) {
    switch(type) {
      case 'bool':
        return false
      case 'int':
      case 'sampler2D':
      case 'samplerCube':
        return 0
      case 'float':
        return 0.0
      default:
        var vidx = type.indexOf('vec')
        if(0 <= vidx && vidx <= 1 && type.length === 4 + vidx) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new GLError('', 'Invalid data type')
          }
          if(type.charAt(0) === 'b') {
            return makeVector(d, false)
          }
          return makeVector(d, 0)
        } else if(type.indexOf('mat') === 0 && type.length === 4) {
          var d = type.charCodeAt(type.length-1) - 48
          if(d < 2 || d > 4) {
            throw new GLError('', 'Invalid uniform dimension type for matrix ' + name + ': ' + type)
          }
          return makeVector(d*d, 0)
        } else {
          throw new GLError('', 'Unknown uniform data type for ' + name + ': ' + type)
        }
    }
  }

  function storeProperty(obj, prop, type) {
    if(typeof type === 'object') {
      var child = processObject(type)
      Object.defineProperty(obj, prop, {
        get: identity(child),
        set: makeSetter(type),
        enumerable: true,
        configurable: false
      })
    } else {
      if(locations[type]) {
        Object.defineProperty(obj, prop, {
          get: makeGetter(type),
          set: makeSetter(type),
          enumerable: true,
          configurable: false
        })
      } else {
        obj[prop] = defaultValue(uniforms[type].type)
      }
    }
  }

  function processObject(obj) {
    var result
    if(Array.isArray(obj)) {
      result = new Array(obj.length)
      for(var i=0; i<obj.length; ++i) {
        storeProperty(result, i, obj[i])
      }
    } else {
      result = {}
      for(var id in obj) {
        storeProperty(result, id, obj[id])
      }
    }
    return result
  }

  //Return data
  var coallesced = coallesceUniforms(uniforms, true)
  return {
    get: identity(processObject(coallesced)),
    set: makeSetter(coallesced),
    enumerable: true,
    configurable: true
  }
}
