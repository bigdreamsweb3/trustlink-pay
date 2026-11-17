

def callback(self, /, work_id):
    return self.funding if work_id == 'mock-funding' else self.current
