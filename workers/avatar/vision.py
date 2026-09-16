from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageOps
import mediapipe as mp

def inspect_photo(path, model_path):
    path=Path(path)
    if not path.is_file() or not 0<path.stat().st_size<=10485760:
        raise ValueError("ARCHIVO_INVALIDO")
    with Image.open(path) as source:
        if source.format not in ("JPEG","PNG"):
            raise ValueError("FORMATO_INVALIDO")
        w,h=source.size
        if min(w,h)<256 or w*h>24000000:
            raise ValueError("RESOLUCION_INVALIDA")
        source=ImageOps.exif_transpose(source).convert("RGB")
        source.thumbnail((1600,1600))
        image=np.array(source)
    h,w=image.shape[:2]
    if cv2.Laplacian(cv2.cvtColor(image,cv2.COLOR_RGB2GRAY),cv2.CV_64F).var()<25:
        raise ValueError("FOTO_BORROSA")
    options=mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,num_poses=2,
        min_pose_detection_confidence=.55,min_pose_presence_confidence=.55,
        output_segmentation_masks=True)
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=image))
        if not result.pose_landmarks:raise ValueError("FOTO_SIN_PERSONA")
        if len(result.pose_landmarks)!=1:raise ValueError("VARIAS_PERSONAS")
        points=result.pose_landmarks[0]
        required=[0,11,12,23,24,25,26,27,28,31,32]
        # El perfil puede ocultar el lado lejano, pero se requieren ambos pies en el encuadre.
        if any(not .01<p.x<.99 or not .01<p.y<.99 for p in [points[i] for i in required]):
            raise ValueError("CUERPO_INCOMPLETO")
        if max(points[31].visibility,points[32].visibility)<.5 or max(points[11].visibility,points[12].visibility)<.5:
            raise ValueError("CUERPO_INCOMPLETO")
        mask=result.segmentation_masks[0].numpy_view().copy()>.6
    ys,xs=np.where(mask)
    if len(ys)<1000 or ys.min()<2 or ys.max()>h-3:
        raise ValueError("CUERPO_INCOMPLETO")
    top,bottom=float(ys.min()),float(ys.max())
    shoulder=(points[11].y+points[12].y)*h/2
    hip=(points[23].y+points[24].y)*h/2
    center=int((points[23].x+points[24].x)*w/2)
    def width_at(y):
        y=int(np.clip(y,0,h-1))
        widths=[]
        for row in mask[max(0,y-2):min(h,y+3)]:
            indices=np.where(row)[0]
            groups=np.split(indices,np.where(np.diff(indices)>1)[0]+1)
            candidates=[g for g in groups if len(g)>0 and g[0]<=center<=g[-1]]
            if candidates:widths.append(len(candidates[0]))
        if not widths:raise ValueError("SILUETA_INVALIDA")
        return float(np.median(widths))
    def length(a,b):
        return float(np.hypot((points[a].x-points[b].x)*w,(points[a].y-points[b].y)*h))
    return {"height_px":bottom-top,"chest_px":width_at(shoulder+(hip-shoulder)*.25),
            "waist_px":width_at(shoulder+(hip-shoulder)*.7),"hip_px":width_at(hip),
            "arm_px":(length(11,13)+length(13,15)+length(12,14)+length(14,16))/2,
            "leg_px":(length(23,25)+length(25,27)+length(24,26)+length(26,28))/2}
