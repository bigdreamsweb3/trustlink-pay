

def g2(scalar, /, point):
    return b''.join((scalar(v) for v in (point[0][1], point[0][0], point[1][1], point[1][0])))
