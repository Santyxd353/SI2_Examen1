import math

def infer_measurements(views, height_cm):
    if not math.isfinite(height_cm) or not 100 <= height_cm <= 230:
        raise ValueError("ALTURA_INVALIDA")
    if set(views) != {"FRENTE", "PERFIL", "ESPALDA"}:
        raise ValueError("VISTAS_INCOMPLETAS")
    def scaled(view, field):
        data = views[view]
        if data["height_px"] <= 0 or data[field] <= 0:
            raise ValueError("SILUETA_INVALIDA")
        return data[field] * height_cm / data["height_px"]
    result = {"altura": {"valor_cm": height_cm, "origen": "DECLARADA", "confianza": 1}}
    for name, field in [("pecho","chest_px"),("cintura","waist_px"),("cadera","hip_px")]:
        front, back = scaled("FRENTE",field), scaled("ESPALDA",field)
        if max(front,back)/min(front,back)>1.5:
            raise ValueError("VISTAS_INCONSISTENTES")
        a=(front+back)/4
        b=scaled("PERFIL",field)/2
        circumference=math.pi*(3*(a+b)-math.sqrt((3*a+b)*(a+3*b)))
        if not 35<=circumference<=200:
            raise ValueError("PROPORCIONES_INVALIDAS")
        result[name]={"valor_cm":round(circumference,2),"origen":"ESTIMADA","confianza":0.5}
    for name,field in [("largoBrazo","arm_px"),("largoPierna","leg_px")]:
        result[name]={"valor_cm":round((scaled("FRENTE",field)+scaled("ESPALDA",field))/2,2),"origen":"ESTIMADA","confianza":0.5}
    return result
