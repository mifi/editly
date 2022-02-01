# gl-transitions

> The open collection of GL Transitions.

<img src="https://camo.githubusercontent.com/c42ecc6197b0f51a106fb50723f9bc6d2e1f925c/687474703a2f2f692e696d6775722e636f6d2f74573331704a452e676966" /> <img src="https://camo.githubusercontent.com/7e34cd12d5a9afa94f470395b04b0914c978ce01/687474703a2f2f692e696d6775722e636f6d2f555a5a727775552e676966" />

This package exposes an Array<Transition> auto-generated from the [GitHub repository](https://github.com/gl-transitions/gl-transitions).

a Transition is an object with following shape:

```js
{
  name: string,
  author: string,
  license: string,
  glsl: string,
  defaultParams: { [key: string]: mixed },
  paramsTypes: { [key: string]: string },
  createdAt: string,
  updatedAt: string,
}
```

For more information, please checkout https://github.com/gl-transitions/gl-transitions

<img src="https://camo.githubusercontent.com/0456d4ed8753fbce027f1174dc8b22da548eeade/687474703a2f2f692e696d6775722e636f6d2f654974426a33582e676966" /> <img src="https://camo.githubusercontent.com/275453118c3efe6f0d722d7cbefba6849af5e13c/687474703a2f2f692e696d6775722e636f6d2f694d5a6e596f332e676966" />


## Install

**with NPM:**

```sh
yarn add gl-transitions
```

```js
import GLTransitions from "gl-transitions";
```

**dist script:**

```
https://unpkg.com/gl-transitions@0/gl-transitions.js
```

```js
const GLTransitions = window.GLTransitions
```

**vanilla JSON:**

```
https://unpkg.com/gl-transitions@0/gl-transitions.json
```
