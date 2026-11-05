# Exports the chosen Z-Anatomy structures (meshes, and curves as tubes) to one GLB, one node per structure.
# Left out: the non-commercial parts (the kidney, CC BY-NC; the inner ear, CC BY-NC-SA), the brain cortex and
# white-matter models (no licence stated), fascia sheets, surface regions, labels and helpers.
import bpy, re, sys
out = sys.argv[sys.argv.index('--') + 1]
NOT_ALLOWED = re.compile(r'kidney|renal|cochle|vestib|semicircular|labyrinth|tympan|malleus|incus|stapes|ossicle|endolymph|perilymph|utricle|saccule|spiral|auditory tube|ear\b|auricul', re.I)
BRAIN = re.compile(r'sulcus|sulci|gyrus|gyri|lobule|fasciculus|tract|white matter|cortex|lobe\b|pole|fissure|lat_fis|vermis|culmen|declive|folium|flocculus|lingula of cerebellum|nodule|pyramis|uvula of vermis|tuber of vermis|central lobule|commissure|septum pellucidum|fornix|nucleus|body|peduncle|olive|aqueduct|ventricle|choroid|falx|tentorium|capsule|claustrum|thalam|amygdal|hippocamp|insula|precuneus|cuneus|operculum|pyramid of medulla|red nucleus|septal', re.I)
SHEETS = re.compile(r'fascia|intermuscular septum|aponeurosis|investing|pleura|omentum|peritone|mesocolon|meso-appendix|region|\.g$', re.I)
WANTED = {
  '4: Muscular system': lambda n, t: not SHEETS.search(n),
  '3: Joints': lambda n, t: not re.search(r'intervertebral disc|nucleus pulposus', n, re.I),
  '7: Nervous system & Sense organs': lambda n, t: (t == 'CURVE' or re.search(r'nerve|ganglion|plexus|spinal|dura|horn of spinal|cauda', n, re.I)) and not BRAIN.search(n) or (t == 'CURVE'),
  '8: Visceral systems': lambda n, t: re.search(r'thyroid|parathyroid|parotid|pharynx|soft palate|uvula|nasal cavity|pineal|hypophysis|duct|bronch|trachea|oesophag|esophag|larynx', n, re.I) is not None,
  '6: Lymphoid organs': lambda n, t: True,
  '5: Cardiovascular system': lambda n, t: t == 'CURVE',
  '1: Skeletal system': lambda n, t: re.search(r'coccyx|sinus|cells of ethmoid|sesamoid|hyoid', n, re.I) is not None,
}
def top(obj):
    for collection in obj.users_collection:
        c = collection
        while True:
            parents = [p for p in bpy.data.collections if c.name in p.children]
            if not parents: break
            c = parents[0]
        if c.name in WANTED: return c.name
    return None
for layer_collection in bpy.context.view_layer.layer_collection.children:
    stack = [layer_collection]
    while stack:
        lc = stack.pop(); lc.exclude = False; lc.hide_viewport = False; stack.extend(lc.children)
for collection in bpy.data.collections: collection.hide_viewport = False; collection.hide_select = False
bpy.ops.object.select_all(action='DESELECT') if bpy.context.object else None
chosen = 0
for obj in bpy.data.objects:
    if obj.type not in ('MESH', 'CURVE'): continue
    group = top(obj)
    if not group or NOT_ALLOWED.search(obj.name): continue
    if obj.type == 'MESH' and len(obj.data.vertices) < 30: continue
    if obj.type == 'CURVE' and (obj.data.bevel_depth <= 0 and not obj.data.bevel_object): continue
    if not WANTED[group](obj.name, obj.type): continue
    if obj.type == 'CURVE': obj.data.resolution_u = 3; obj.data.bevel_resolution = 1
    obj.hide_set(False); obj.hide_viewport = False; obj.hide_select = False
    obj['zgroup'] = group
    obj.select_set(True); chosen += 1
print('chosen', chosen)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_materials='NONE',
                          export_extras=True, export_yup=True, export_texcoords=False, export_normals=False, export_animations=False)
