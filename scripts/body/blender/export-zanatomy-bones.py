# Exports Z-Anatomy's main bones, used only to align Z-Anatomy with BodyParts3D (not shown in the app).
import bpy, re, sys
out = sys.argv[sys.argv.index('--') + 1]
BONES = re.compile(r'^(femur|tibia|fibula|humerus|radius|ulna|scapula|clavicle|hip bone|sacrum|frontal bone|occipital bone|mandible|patella|calcaneus|manubrium of sternum|body of sternum|sternum|vertebra [ctl]\d+|atlas|axis|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib)(\.[lr])?$', re.I)
for layer_collection in bpy.context.view_layer.layer_collection.children:
    stack = [layer_collection]
    while stack:
        lc = stack.pop(); lc.exclude = False; lc.hide_viewport = False; stack.extend(lc.children)
chosen = 0
for obj in bpy.data.objects:
    if obj.type != 'MESH' or len(obj.data.vertices) < 30 or not BONES.match(obj.name): continue
    obj.hide_set(False); obj.hide_viewport = False; obj.hide_select = False; obj.select_set(True); chosen += 1
print('chosen', chosen)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_materials='NONE', export_yup=True, export_texcoords=False, export_normals=False, export_animations=False)
