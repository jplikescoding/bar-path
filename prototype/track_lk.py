import cv2, numpy as np, os

OUT = r"C:\Users\JP\AppData\Local\Temp\claude\C--Users-JP-projects\8e4e4b7d-0a55-4a8d-a4ce-f3e7da975d27\scratchpad\proof"
os.makedirs(OUT, exist_ok=True)

LK = dict(winSize=(31,31), maxLevel=3,
          criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT, 30, 0.01))

def red_hub(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv,(0,90,70),(10,255,255)) | cv2.inRange(hsv,(170,90,70),(180,255,255))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5,5),np.uint8))
    cnts,_ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < 30: return None
    M = cv2.moments(c)
    return (M['m10']/M['m00'], M['m01']/M['m00'])

def track(path, seed=None, use_red=False, name="clip"):
    cap = cv2.VideoCapture(path)
    frames=[]
    while True:
        ok,f = cap.read()
        if not ok: break
        frames.append(f)
    cap.release()
    h,w = frames[0].shape[:2]
    if use_red:
        seed = red_hub(frames[0])
    seed = (float(seed[0]), float(seed[1]))
    # cluster of features around seed
    g0 = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    R=45
    mask=np.zeros_like(g0); cv2.circle(mask,(int(seed[0]),int(seed[1])),R,255,-1)
    feats = cv2.goodFeaturesToTrack(g0, maxCorners=40, qualityLevel=0.01,
                                    minDistance=4, mask=mask)
    if feats is None:
        feats = np.array([[[seed[0],seed[1]]]],np.float32)
    p0 = feats.astype(np.float32)
    offset0 = p0[:,0,:] - np.array(seed)          # offset of each feat from bar point
    prev = g0
    path_pts=[seed]; lost_at=None
    for i in range(1,len(frames)):
        gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
        p1,st,err = cv2.calcOpticalFlowPyrLK(prev,gray,p0,None,**LK)
        # forward-backward check
        p0b,stb,_ = cv2.calcOpticalFlowPyrLK(gray,prev,p1,None,**LK)
        fb = np.linalg.norm(p0-p0b,axis=2).reshape(-1)
        good = (st.reshape(-1)==1)&(stb.reshape(-1)==1)&(fb<2.0)
        if good.sum()<3:
            lost_at=i; path_pts.append(path_pts[-1]); 
            prev=gray; continue
        cur = p1[good][:,0,:]
        off = offset0[good]
        bar = np.median(cur-off,axis=0)           # robust bar point
        path_pts.append((float(bar[0]),float(bar[1])))
        # refresh anchor so it adapts
        p0 = cur.reshape(-1,1,2); offset0 = cur - bar
        prev = gray
    pts = np.array(path_pts)
    # ---- stats ----
    xs,ys = pts[:,0],pts[:,1]
    # active range = where vertical movement happens
    print(f"\n=== {name} ===")
    print(f"frames={len(frames)}  tracked={len(pts)}  lost_at={lost_at}")
    print(f"x range (horiz drift): {xs.max()-xs.min():.1f}px on {w}px wide  ({100*(xs.max()-xs.min())/w:.1f}% of width)")
    print(f"y range (vertical travel): {ys.max()-ys.min():.1f}px on {h}px tall")
    # ---- overlay on a representative frame ----
    base = frames[len(frames)//2].copy()
    for j in range(1,len(pts)):
        cv2.line(base,(int(pts[j-1][0]),int(pts[j-1][1])),
                      (int(pts[j][0]),int(pts[j][1])),(0,255,0),3)
    cv2.line(base,(int(seed[0]),0),(int(seed[0]),h),(0,180,255),1)  # vertical ref
    cv2.circle(base,(int(seed[0]),int(seed[1])),6,(0,0,255),-1)
    sc=640/max(w,h); base=cv2.resize(base,(int(w*sc),int(h*sc)))
    cv2.imwrite(os.path.join(OUT,f"{name}_overlay.jpg"),base,[cv2.IMWRITE_JPEG_QUALITY,82])
    # ---- clean path plot ----
    pad=40; pw,ph=420,640
    canvas=np.full((ph,pw,3),255,np.uint8)
    x0,x1,y0,y1 = xs.min(),xs.max(),ys.min(),ys.max()
    sx=(pw-2*pad)/max(x1-x0,1); sy=(ph-2*pad)/max(y1-y0,1); s=min(sx,sy)
    def tp(p): return (int(pad+(p[0]-x0)*s), int(pad+(p[1]-y0)*s))
    # true-vertical ref line through start x
    vx=tp(seed)[0]; cv2.line(canvas,(vx,pad),(vx,ph-pad),(200,200,200),1)
    for j in range(1,len(pts)):
        cv2.line(canvas,tp(pts[j-1]),tp(pts[j]),(0,140,0),2)
    cv2.circle(canvas,tp(seed),5,(0,0,255),-1)
    cv2.imwrite(os.path.join(OUT,f"{name}_path.jpg"),canvas,[cv2.IMWRITE_JPEG_QUALITY,85])
    return pts

track(r"C:\Users\JP\Videos\deadlift 10s.mp4", use_red=True, name="dl10_lowangle")
track(r"C:\Users\JP\Videos\squat brown shirt high angle no bar path.mp4",
      seed=(140,470), name="squat_levelangle")
print("\nOUT:", OUT)
