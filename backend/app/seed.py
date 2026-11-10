from .db import db, ensure_indexes
from .helpers import now

def run():
    ensure_indexes()
    cats=[('Smart Glasses','smart-glasses',1),('Sunglasses','sunglasses',2),('Frames','frames',3)]
    for n,s,o in cats: db.categories.update_one({'slug':s},{'$set':{'name':n,'slug':s,'order':o,'visible':True}},upsert=True)
    for o,n in enumerate(['AIMB','JM91','GT51','TXK'],1): db.brands.update_one({'slug':n.lower()},{'$set':{'name':n,'slug':n.lower(),'order':o,'visible':True}},upsert=True)
    products=[
      {'name':'AIMB G2 Pro','slug':'aimb-g2-pro','category_slug':'smart-glasses','brand_slug':'aimb','price':5499,'stock':20,'weight_kg':.35,'colors':['Black'],'features':['8MP Camera','AI Image Recognition','Multilingual Translation','Wi-Fi Connectivity','Voice Recording','8 Hours Battery Backup','3 Interchangeable Lenses'],'description':'AI smart glasses with camera and interchangeable lenses.','images':[],'video_url':'','status':'active','featured':True,'new_collection':True,'reserved':0},
      {'name':'TXK Smart Glasses','slug':'txk-smart-glasses','category_slug':'smart-glasses','brand_slug':'txk','price':3999,'stock':20,'weight_kg':.3,'colors':['Black'],'features':['Bluetooth Audio','Voice Calls','Multilingual Translation','Smart Connectivity','8 Hours Battery Backup'],'description':'Camera-free smart glasses.','images':[],'video_url':'','status':'active','featured':True,'new_collection':True,'reserved':0}
    ]
    for p in products:
        p['created_at']=p['updated_at']=now(); db.products.update_one({'slug':p['slug']},{'$set':p},upsert=True)
    db.coupons.update_one({'code':'WELCOME100'},{'$set':{'code':'WELCOME100','type':'fixed','value':100,'active':False,'allow_bulk':False,'created_at':now()}},upsert=True)
    print('Seed complete')

if __name__=='__main__': run()
