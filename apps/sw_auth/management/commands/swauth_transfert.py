from optparse import make_option
from django.core.management.base import CommandError, BaseCommand
from apps.sw_auth.models import EpiworkUser
from django.contrib.auth.models import User, UNUSABLE_PASSWORD
from ...utils import random_string
from django.db import transaction

class Command(BaseCommand):
    help = 'Transfert users to new auth'
    option_list = BaseCommand.option_list + (
        make_option('-f', '--fake', action='store_true', dest='fake', default=False, help='User id'),
    )

    @transaction.commit_manually()
    def handle(self, *args, **options):
        
        fake = options['fake']
        ok = 0
        error = 0
        for u in User.objects.all():
            login = u.username
            email = u.email
            password = u.password
            active = u.is_active
            
            if u.is_staff:
                print "[skip] user %d %s" % (u.id, u.username)
                continue
            username = random_string(30)
            
            try:
                e = EpiworkUser.objects.get(login=login)
                print "[skip] %s already exists" % login
                continue
            except EpiworkUser.DoesNotExist:
                pass
            
            e = EpiworkUser()
            e.email = email
            e.login = login
            e.password = password
            e.is_active = active
            e.set_user(username)
            
            check = e.get_user()
            if check != username:
                print "[bad] user %d %s %s bad cipher" % (u.id, username, check)
                continue
            
            u.email = "%s@localhost" % username
            u.username = username
            u.password = UNUSABLE_PASSWORD
            u.first_name = ''
            u.last_name = ''
            if not fake:
                
                try:
                    e.save()
                    u.save()
                    transaction.commit()
                    print "user %d OK " % u.id
                    ok += 1 
                except:
                    print "user %d ERROR " % u.id 
                    transaction.rollback()
                    error += 1
                    pass
            else:
                print "[fake] user %d to %s" % (u.id, username)                
        print "success : %d error %d " % (ok, error)