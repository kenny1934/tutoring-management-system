"""A separate frontend origin must be able to read its downloaded bank total."""
from main import allow_origins
from tests.test_billing_api import COOKIE, staff


def test_allowed_frontend_can_read_bank_download_metadata(client, staff):
    response = client.get('/api/billing/options', cookies=COOKIE,
                          headers={'Origin': allow_origins[0]})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == allow_origins[0]
    exposed = {name.strip().lower() for name in
               response.headers['access-control-expose-headers'].split(',')}
    assert {'content-disposition', 'x-csm-export-total', 'x-csm-export-count',
            'x-csm-export-hash'} <= exposed
