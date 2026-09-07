// Unit tests install their own provider credentials and mocks. Never inherit
// deployment credentials into assertions, request spies or failure output.
for (const name of Object.keys(process.env)) {
  if (/^(GROQ_|NVIDIA_)/.test(name)) delete process.env[name]
}
