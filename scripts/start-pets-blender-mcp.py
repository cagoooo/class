"""Dedicated loopback MCP session; no saved preferences or existing scenes changed."""
import bpy
import addon_utils
addon_utils.enable('blender_mcp', default_set=False)
bpy.context.scene.blendermcp_port = 18765
if getattr(bpy.types, 'blendermcp_server', None) and not bpy.types.blendermcp_server.running:
    bpy.types.blendermcp_server.host = '127.0.0.1'
    bpy.types.blendermcp_server.port = 18765
bpy.ops.blendermcp.start_server()
print('Class pets MCP running:', bpy.types.blendermcp_server.running, flush=True)
