import os
import secrets
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('Uso: init-vm-env.py RUTA HOST_PUBLICO')
    target = Path(sys.argv[1]).resolve()
    if target.exists():
        return
    target.write_text(
        '\n'.join(
            [
                f'PUBLIC_HOST={sys.argv[2]}',
                f'POSTGRES_PASSWORD={secrets.token_hex(32)}',
                f'JWT_SECRET={secrets.token_hex(64)}',
                '',
            ]
        ),
        encoding='ascii',
    )
    os.chmod(target, 0o600)


if __name__ == '__main__':
    main()
