/*! JavaScript/NodeJS Merge v1.2.0 | Copyright 2014 yeikos - MIT license | https://github.com/yeikos/js.merge */

;
(function(e) {
  function r(e, t) {
    if (s(e) !== "object") return t;
    for (var n in t) {
      if (s(e[n]) === "object" && s(t[n]) === "object") {
        e[n] = r(e[n], t[n])
      } else {
        e[n] = t[n]
      }
    }
    return e
  }

  function i(e, n, i) {
    var o = i[0],
      u = i.length;
    if (e || s(o) !== "object") o = {};
    for (var a = 0; a < u; ++a) {
      var f = i[a],
        l = s(f);
      if (l !== "object") continue;
      for (var c in f) {
        var h = e ? t.clone(f[c]) : f[c];
        if (n) {
          o[c] = r(o[c], h)
        } else {
          o[c] = h
        }
      }
    }
    return o
  }

  function s(e) {
    return {}.toString.call(e).slice(8, -1).toLowerCase()
  }
  var t = function(e) {
      return i(e === true, false, arguments)
    },
    n = "merge";
  t.recursive = function(e) {
    return i(e === true, true, arguments)
  };
  t.clone = function(e) {
    var n = e,
      r = s(e),
      i, o;
    if (r === "array") {
      n = [];
      o = e.length;
      for (i = 0; i < o; ++i) n[i] = t.clone(e[i])
    } else if (r === "object") {
      n = {};
      for (i in e) n[i] = t.clone(e[i])
    }
    return n
  };
  if (e) {
    module.exports = t
  } else {
    window[n] = t
  }
})(typeof module === "object" && module && typeof module.exports === "object" && module.exports);
