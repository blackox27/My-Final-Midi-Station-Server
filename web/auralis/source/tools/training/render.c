#define TSF_IMPLEMENTATION
#include "tsf.h"
tsf* auralis_load(const char* filename){return tsf_load_filename(filename);}
int auralis_render(tsf* font,int program,int key,float velocity,float duration,float* out,int samples){
  int preset=tsf_get_presetindex(font,0,program);if(preset<0)return 0;
  tsf_reset(font);tsf_set_output(font,TSF_MONO,22050,0);tsf_note_on(font,preset,key,velocity);
  int held=(int)(duration*22050);if(held>samples)held=samples;
  tsf_render_float(font,out,held,0);tsf_note_off(font,preset,key);tsf_render_float(font,out+held,samples-held,0);return 1;
}
