from django.conf import settings
from django import http
from django.template import Context, loader

def server_error(request, template_name='500.html'):
    """
    500 error handler.

    Templates: `500.html`
    Context:
        MEDIA_URL
            Path of static media (e.g. "media.example.org")

    Django's standard 500 error handler does not serve MEDIA_URL correctly; this one does
    """
    t = loader.get_template(template_name)
    return http.HttpResponseServerError(t.render(Context({
        'MEDIA_URL': settings.MEDIA_URL
    })))
