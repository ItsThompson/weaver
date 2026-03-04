Since we have turn data for the agents, what if on the STOP turn we run some special validation logic. This would need to be coupled in to weaver. So like there would be a ~/.weaver global file we follow but the local cwd .weaver/ would take precedence. That file would contain some configuration to specify some sort of validation hooks by querying tool usage and what files were written to.

- Validation Hooks: Hook into after `write` tool usage -> linting, type checking, running tests, etc. before allowing the conversation to continue. Might be on a per project basis as different projects will have different validation needs. When hooks return with exit code 0 any STDOUT data will be added to agent's context.


Like user will describe their testing framework? and then we can run the tests?

We would need to develop some sort of convention/schema for how our .weaver files would be structured.
