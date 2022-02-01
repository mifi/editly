// Author: Fernando Kuteken
// License: MIT

uniform vec2 center; // = vec2(0.5, 0.5);
uniform vec3 backColor; // = vec3(0.1, 0.1, 0.1);

vec4 transition (vec2 uv) {
  
  float distance = length(uv - center);
  float radius = sqrt(8.0) * abs(progress - 0.5);
  
  if (distance > radius) {
    return vec4(backColor, 1.0);
  }
  else {
    if (progress < 0.5) return getFromColor(uv);
    else return getToColor(uv);
  }
}
