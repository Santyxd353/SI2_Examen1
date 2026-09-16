"""Geometría propia de referencia; Blender exporta mallas en GLB con eje Y vertical."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
    m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=.8
    return m

def ellipsoid(name,location,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=location)
    o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    return o

def limb(name,a,b,radius,mat):
    a,b=Vector(a),Vector(b);mid=(a+b)/2
    o=ellipsoid(name,mid,(radius,radius,(a-b).length/2+radius*.45),mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def rings(name,sections,mat,cap=False):
    vertices=[];faces=[];n=64
    for z,rx,ry in sections:
        for i in range(n):
            angle=math.tau*i/n;vertices.append((rx*math.cos(angle),ry*math.sin(angle),z))
    for row in range(len(sections)-1):
        for i in range(n):
            j=row*n+i;k=row*n+(i+1)%n
            faces.append((j,k,k+n,j+n))
    if cap:
        faces.append(tuple(reversed(range(n))))
        faces.append(tuple(range((len(sections)-1)*n,len(sections)*n)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    for f in mesh.polygons:f.use_smooth=True
    return o

def export(filepath,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)

def build(parameters,out,reference=False):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    skin=material('Cuerpo neutro',(0.57,0.51,0.44))
    fabric=material('Algodón',(0.78,0.77,0.7))
    height=parameters.get('height',1.7);s=height/1.7
    chest=parameters.get('chest_width',.36)/2/s
    depth=parameters.get('chest_depth',.24)/2/s
    waist=parameters.get('waist_width',.30)/2/s
    hips=parameters.get('hip_width',.36)/2/s
    body=[]
    body.append(rings('Torso',[(.80,hips*.88,.10),(.89,hips,.125),(1.01,waist,.105),(1.14,chest*.98,depth),(1.28,chest,depth),(1.37,chest*.96,depth*.9),(1.43,.095,.075)],skin,cap=True))
    body.append(ellipsoid('Cabeza',(0,0,1.585),(.09,.095,.115),skin))
    body.append(limb('Cuello',(0,0,1.39),(0,0,1.49),.056,skin))
    body.append(ellipsoid('Pelvis',(0,0,.835),(hips,.125,.13),skin))
    for side in (-1,1):
        hip=(side*.095,0,.85);knee=(side*.105,0,.48);ankle=(side*.12,0,.12)
        body.append(limb('Muslo',hip,knee,hips*.44,skin))
        body.append(ellipsoid('Rodilla',knee,(.054,.059,.068),skin))
        body.append(limb('Pantorrilla',knee,ankle,.052,skin))
        body.append(ellipsoid('Tobillo',ankle,(.038,.04,.057),skin))
        body.append(ellipsoid('Pie',(side*.12,-.045,.055),(.058,.105,.055),skin))
        shoulder=(side*(chest+.02),0,1.355);elbow=(side*(chest+.14),0,1.12);wrist=(side*(chest+.22),-.008,.91)
        body.append(ellipsoid('Hombro',shoulder,(.079,.08,.088),skin))
        body.append(limb('Brazo',shoulder,elbow,.055,skin))
        body.append(ellipsoid('Codo',elbow,(.044,.046,.05),skin))
        body.append(limb('Antebrazo',elbow,wrist,.043,skin))
        body.append(ellipsoid('Mano',(wrist[0],-.01,.858),(.042,.026,.065),skin))
    for o in body:
        o.location*=s;o.scale*=s
        o['plantilla']='g18-1';o['reference']=reference
    # Fuse the intersecting volumes into a continuous body surface.
    bpy.ops.object.select_all(action='DESELECT')
    for o in body:o.select_set(True)
    bpy.context.view_layer.objects.active=body[0]
    bpy.ops.object.join()
    fused=bpy.context.object;fused.name='Cuerpo_G18'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    remesh=fused.modifiers.new('Superficie continua','REMESH')
    remesh.mode='VOXEL';remesh.voxel_size=.007*s;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=fused.modifiers.new('Suavizado','SMOOTH');smooth.factor=1.1;smooth.iterations=4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=fused.modifiers.new('Malla para visor','DECIMATE');decimate.ratio=.4
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    export(out/('reference.glb' if reference else 'avatar.glb'),[fused])
    if reference:
        shirt=rings('Camiseta',[(.91,.195,.148),(.96,.195,.148),(1.07,.185,.14),(1.21,.201,.148),(1.34,.208,.139),(1.397,.19,.107),(1.445,.075,.072)],fabric)
        clothes=[shirt]
        for side in (-1,1):
            sleeve=limb('Manga',(side*.203,0,1.36),(side*.31,0,1.19),.093,fabric);clothes.append(sleeve)
        for o in clothes:o['plantilla']='g18-1'
        export(out/'garment.glb',clothes)
        for size,factor in [('S',.94),('M',1.0),('L',1.06)]:
            for o in clothes:
                o.scale.x=factor;o.scale.y=factor
                o.location.x=0 if o is shirt else o.location.x
            export(out/('garment-'+size+'.glb'),clothes)
    return len(body)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];request=json.loads(Path(args[0]).read_text())
    out=Path(request['output_dir']);out.mkdir(parents=True,exist_ok=True)
    build(request['parameters'],out,request.get('reference',False))
