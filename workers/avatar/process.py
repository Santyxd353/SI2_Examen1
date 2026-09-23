import sys,json,subprocess,hashlib,os
from pathlib import Path
from geometry import infer_measurements

ROOT=Path(__file__).resolve().parents[2]
MODEL=Path(os.getenv('POSE_MODEL_PATH',ROOT/'.local/worker/pose_landmarker.task')).resolve()
BLENDER=Path(os.getenv('BLENDER_PATH',ROOT/'.local/worker/blender-4.5.3-windows-x64/blender.exe')).resolve()
def export(parameters,out,reference=False):
    if not BLENDER.is_file():raise ValueError("BLENDER_NO_DISPONIBLE")
    config=out/'export.json'
    config.write_text(json.dumps({'parameters':parameters,'output_dir':str(out),'reference':reference}),encoding='utf-8')
    try:
        result=subprocess.run([str(BLENDER),'--background','--factory-startup','--python',str(Path(__file__).with_name('blender_export.py')),'--',str(config)],capture_output=True,timeout=120)
        expected=out/('reference.glb' if reference else 'avatar.glb')
        if result.returncode!=0 or not expected.is_file():raise ValueError("EXPORTACION_FALLIDA")
        if expected.read_bytes()[:4]!=b'glTF':raise ValueError("GLB_INVALIDO")
    finally:config.unlink(missing_ok=True)

def generate(job):
    from vision import inspect_photo
    height=float(job['height_cm'])
    photos=job['photos']
    if set(photos)!={'FRENTE','PERFIL','ESPALDA'}:raise ValueError("VISTAS_INCOMPLETAS")
    paths=[Path(photos[k]).resolve() for k in photos]
    for path in paths:
        if not path.is_file() or not 0<path.stat().st_size<=10485760:raise ValueError("ARCHIVO_INVALIDO")
    if len({hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})!=3:raise ValueError("VISTAS_REPETIDAS")
    if not MODEL.is_file():raise ValueError("MODELO_NO_DISPONIBLE")
    views={k:inspect_photo(v,MODEL) for k,v in photos.items()}
    measures=infer_measurements(views,height)
    def width(view,field):return views[view][field]*height/views[view]['height_px']/100
    parameters={'height':height/100,'chest_width':(width('FRENTE','chest_px')+width('ESPALDA','chest_px'))/2,
        'chest_depth':width('PERFIL','chest_px'),'waist_width':(width('FRENTE','waist_px')+width('ESPALDA','waist_px'))/2,
        'hip_width':(width('FRENTE','hip_px')+width('ESPALDA','hip_px'))/2,'plantilla':'g18-1'}
    out=Path(job['output_dir']).resolve();out.mkdir(parents=True,exist_ok=True)
    export(parameters,out)
    return {'ok':True,'avatar_file':str(out/'avatar.glb'),'medidas':measures,'parametros_malla':parameters,'version_proceso':'g18-1.0'}

def main():
    if len(sys.argv)==2 and sys.argv[1]=='--check':
        from vision import inspect_photo
        ok=MODEL.is_file() and BLENDER.is_file()
        return {'ok':ok,'mediapipe_model':MODEL.is_file(),'blender':BLENDER.is_file()}
    if len(sys.argv)==3 and sys.argv[1]=='--demo':
        out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
        export({'height':1.7},out,True)
        (out/'metadata.json').write_text(json.dumps({'reference':True,'plantilla':'g18-1','licencia':'Geometría propia Grupo 18','height':1.7}),encoding='utf8')
        return {'ok':True,'reference_file':str(out/'reference.glb'),'garment_file':str(out/'garment.glb'),
            'dress_file':str(out/'dress-M.glb'),'skirt_file':str(out/'skirt-M.glb')}
    if len(sys.argv)==3 and sys.argv[1]=='--job':
        return generate(json.loads(Path(sys.argv[2]).read_text(encoding='utf8')))
    raise ValueError('ARGUMENTOS_INVALIDOS')
if __name__=='__main__':
    try:
        result=main();print(json.dumps(result,ensure_ascii=True));sys.exit(0 if result['ok'] else 1)
    except Exception as e:
        code=str(e)
        if not code.replace('_','').isupper() or len(code)>60:code='PROCESAMIENTO_FALLIDO'
        print(json.dumps({'ok':False,'error_code':code,'message':'No se pudo generar el avatar. Revisa las fotos y vuelve a intentarlo.'},ensure_ascii=True));sys.exit(1)
