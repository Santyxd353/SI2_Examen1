import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pytest
from geometry import infer_measurements

def views(width=40, depth=26):
    return {
      "FRENTE":{"height_px":1700,"chest_px":width*10,"waist_px":320,"hip_px":380,"arm_px":570,"leg_px":780},
      "ESPALDA":{"height_px":1700,"chest_px":width*10,"waist_px":320,"hip_px":380,"arm_px":570,"leg_px":780},
      "PERFIL":{"height_px":1700,"chest_px":depth*10,"waist_px":230,"hip_px":270,"arm_px":570,"leg_px":780}
    }

def test_height_scales_circumferences_from_photos():
    a=infer_measurements(views(),170)
    b=infer_measurements(views(),187)
    assert a["pecho"]["valor_cm"] == pytest.approx(104.81,abs=.2)
    assert b["pecho"]["valor_cm"]/a["pecho"]["valor_cm"] == pytest.approx(1.1,abs=.002)
    assert a["altura"]["valor_cm"] == 170

def test_different_silhouettes_change_body_not_constant_avatar():
    a=infer_measurements(views(),170)
    b=infer_measurements(views(46,30),170)
    assert b["pecho"]["valor_cm"]>a["pecho"]["valor_cm"]+14

@pytest.mark.parametrize("height",[99,231,float("nan")])
def test_out_of_range_height_is_rejected(height):
    with pytest.raises(ValueError,match="ALTURA_INVALIDA"):
        infer_measurements(views(),height)

def test_missing_view_is_rejected():
    data=views();del data["PERFIL"]
    with pytest.raises(ValueError,match="VISTAS_INCOMPLETAS"):
        infer_measurements(data,170)
