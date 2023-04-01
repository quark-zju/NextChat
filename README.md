A fork of [ChatGPT-Next-Web](https://github.com/Yidadaa/ChatGPT-Next-Web) with some customizations:

API:
- Does not proxy user-provided `OPENAPI_API_KEY` requests. The API key can only be set by server-side `OPENAI_API_KEY`.
- Added a limit about the total request count, specified by the `usage-limit` file. To set the limit to `123`, run `rm -f state/usage-limit; ln -s 123 state/usage-limit`.

UI:
- Reduced the height of the input box.
- Minor changes to translations.

Config:
- Default send key is "ENTER".
- Prefer `zh-CN` if the browser language list includes it.
