import os,sys,json,struct,subprocess
from pathlib import Path
import pytest
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vision import inspect_photo
from process import MODEL,generate,export

def test_uniform_image_rejected(tmp_path):
    path=tmp_path/'blank.png';Image.new('RGB',(600,900),'white').save(path)
    with pytest.raises(ValueError,match='FOTO_BORROSA'):
        inspect_photo(path,MODEL)

def test_repeated_views_are_rejected_before_generation(tmp_path):
    photos={}
    for view in ['FRENTE','PERFIL','ESPALDA']:
        path=tmp_path/(view+'.png');Image.new('RGB',(600,900),'white').save(path);photos[view]=str(path)
    with pytest.raises(ValueError,match='VISTAS_REPETIDAS'):
        generate({'height_cm':170,'photos':photos,'output_dir':str(tmp_path/'out')})

def test_blender_exports_valid_gltf_with_personal_dimensions(tmp_path):
    export({'height':1.85,'chest_width':.44,'chest_depth':.29,'waist_width':.35,'hip_width':.42},tmp_path)
    data=(tmp_path/'avatar.glb').read_bytes()
    magic,version,length=struct.unpack('<4sII',data[:12])
    assert magic==b'glTF' and version==2 and length==len(data)
    json_length=struct.unpack('<I',data[12:16])[0]
    document=json.loads(data[20:20+json_length])
    assert len(document['meshes'])>=1
    positions=[document['accessors'][p['attributes']['POSITION']] for m in document['meshes'] for p in m['primitives']]
    # Exported body coordinates retain the declared height in metres (Y-up).
    height=max(a['max'][1] for a in positions)-min(a['min'][1] for a in positions)
    assert height == pytest.approx(1.85,abs=.02)
    assert all(a['max'][i]>=a['min'][i] for a in positions for i in range(3))
    assert not (tmp_path/'export.json').exists()
    assert any(node.get('extras',{}).get('reference') is False for node in document['nodes'])


def test_demo_exports_distinct_dress_and_skirt_meshes_for_all_sizes(tmp_path):
    result=subprocess.run(
        [sys.executable,str(Path(__file__).resolve().parents[1]/'process.py'),'--demo',str(tmp_path)],
        capture_output=True,text=True,check=True,
    )
    assert json.loads(result.stdout)['ok'] is True
    for kind in ('dress','skirt'):
        for size in ('S','M','L'):
            path=tmp_path/f'{kind}-{size}.glb'
            assert path.is_file()
            data=path.read_bytes()
            magic,version,length=struct.unpack('<4sII',data[:12])
            assert (magic,version,length)==(b'glTF',2,len(data))
            document=json.loads(data[20:20+struct.unpack('<I',data[12:16])[0]])
            assert document['meshes']

def test_worker_paths_honor_environment(tmp_path):
    model=tmp_path/'pose.task';blender=tmp_path/'blender'
    env=os.environ.copy()
    env.update({'POSE_MODEL_PATH':str(model),'BLENDER_PATH':str(blender)})
    result=subprocess.run(
        [sys.executable,'-c','import process;print(process.MODEL);print(process.BLENDER)'],
        cwd=Path(__file__).resolve().parents[1],env=env,capture_output=True,text=True,check=True,
    )
    assert result.stdout.splitlines()==[str(model.resolve()),str(blender.resolve())]
