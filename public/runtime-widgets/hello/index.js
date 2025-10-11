import { defineComponent as f, createElementBlock as g, openBlock as h, normalizeStyle as v, createElementVNode as i, toDisplayString as m, unref as r, withDirectives as b, vModelText as y } from "vue";
import { computed as w } from "/src/runtime/vue.ts";
import { fsValidate as _ } from "/src/bridge/ipc.ts";
const k = { class: "title" }, x = { class: "row" }, C = /* @__PURE__ */ f({
  __name: "Widget",
  props: {
    config: {},
    theme: {},
    runAction: { type: Function }
  },
  setup(n) {
    const e = n, a = w(() => {
      var o, t;
      return {
        data: ((o = e.config) == null ? void 0 : o.data) || {},
        view: ((t = e.config) == null ? void 0 : t.view) || {}
      };
    });
    async function s() {
      var c;
      const o = String(a.value.data.targetPath || "");
      if (!o) return;
      const t = await _(o);
      t != null && t.ok && t.exists && ((c = e.runAction) == null || c.call(e, { type: "nav", to: t.path || o }));
    }
    function l() {
      var o;
      (o = e.runAction) == null || o.call(e, { type: "openUrl", url: "https://example.com" });
    }
    return (o, t) => {
      var c, d, u;
      return h(), g("div", {
        class: "card",
        style: v({ background: (c = n.theme) == null ? void 0 : c.bg, color: (d = n.theme) == null ? void 0 : d.fg, borderColor: (u = n.theme) == null ? void 0 : u.border })
      }, [
        i("div", k, m(r(a).data.message), 1),
        i("div", x, [
          b(i("input", {
            class: "inp",
            "onUpdate:modelValue": t[0] || (t[0] = (p) => r(a).data.targetPath = p),
            placeholder: "Type a path, e.g. C:\\\\ or /"
          }, null, 512), [
            [y, r(a).data.targetPath]
          ]),
          i("button", {
            class: "btn",
            onClick: s
          }, m(r(a).view.buttonLabel), 1)
        ]),
        i("div", { class: "row" }, [
          i("button", {
            class: "btn",
            onClick: l
          }, "Open site")
        ])
      ], 4);
    };
  }
}), P = (n, e) => {
  const a = n.__vccOpts || n;
  for (const [s, l] of e)
    a[s] = l;
  return a;
}, A = /* @__PURE__ */ P(C, [["__scopeId", "data-v-9f2924f0"]]), T = {
  api: "1.0",
  id: "hello",
  version: "0.0.1",
  Component: A,
  defaults: {
    data: { message: "Hello, World!", targetPath: "" },
    // try C:\\ or / later
    view: { buttonLabel: "Open", layout: "card" }
  },
  capabilities: []
};
export {
  T as default
};
