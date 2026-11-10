# Exports Z-Anatomy's bones, used only to align Z-Anatomy with BodyParts3D (not shown in the app): every mesh of its
# skeletal system. The build pairs each with the BodyParts3D bone of the same name.
import bpy, re, sys
out = sys.argv[sys.argv.index('--') + 1]
SKIP = re.compile(r'\.g$|\?|cartilage|ligament|membrane|suture|sinus|cells of|region|surface|line\b|foramen|fossa|process\b|tubercle|tuberosity|crest|notch|groove|canal|condyle\b|angle|border|margin|head of|neck of|body of (?!sternum)|base of|shaft', re.I)
def in_skeleton(obj):
    for collection in obj.users_collection:
        c = collection
        while True:
            if c.name == '1: Skeletal system': return True
            parents = [p for p in bpy.data.collections if c.name in p.children]
            if not parents: break
            c = parents[0]
    return False
for layer_collection in bpy.context.view_layer.layer_collection.children:
    stack = [layer_collection]
    while stack:
        lc = stack.pop(); lc.exclude = False; lc.hide_viewport = False; stack.extend(lc.children)
for collection in bpy.data.collections: collection.hide_viewport = False; collection.hide_select = False
chosen = 0
for obj in bpy.data.objects:
    if obj.type != 'MESH' or len(obj.data.vertices) < 30 or SKIP.search(obj.name) or not in_skeleton(obj): continue
    obj.hide_set(False); obj.hide_viewport = False; obj.hide_select = False; obj.select_set(True); chosen += 1
print('chosen', chosen)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_materials='NONE', export_yup=True, export_texcoords=False, export_normals=False, export_animations=False)
