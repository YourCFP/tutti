# @tutti-os/workspace-external-core

Contracts and host-agnostic helpers for the workspace app external bridge.

Workspace apps are trusted installed app packages. The external bridge is a
privileged host integration surface, not a web-style permission sandbox. User
activation gates disruptive host UI such as dialogs and navigation, while
trusted app APIs may read or update host workspace state directly.

`window.tuttiExternal` currently exposes:

- `app.getContext()` and `app.subscribe()` for host workspace/app context.
- `at.query()` for host-provided mention candidates.
- `files.select()` for user-activated workspace file picking.
- `files.open()` for user-activated host opening/revealing of a known workspace file path.
- `files.upload()` for trusted app upload of a browser `File`/`Blob` into the
  app's managed durable data path, with optional progress and `AbortSignal`
  cancellation. It returns file metadata only; app-specific asset records remain
  owned by the calling app.
- `permissions.request()` for user-activated host permission grants such as managed AI model access.
- `pdf.printHtmlToPdf()` for user-activated host PDF generation from print-ready HTML.
- `settings.open()` for user-activated host settings navigation, including the managed models tab.
- `userProjects.*` for trusted app access to local user project paths, default
  project selection, project directory creation, and recently used project
  state.
- `workspace.openFeature()` for user-activated host workspace navigation, such as opening the message center.
- `logs.write()` for fire-and-forget frontend diagnostics that append to the workspace app `web.log`.
